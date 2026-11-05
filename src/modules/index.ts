import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { jidNormalizedUser, type WASocket } from "@whiskeysockets/baileys";
import type { ParsedMessage } from "../parser";
import { getAnalytics } from "../analytics/store";

export interface ModuleContext {
  message: ParsedMessage;
  socket: WAMessageSocket;
  modules: ModuleMeta[];
}

export interface WAMessageSocket {
  sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
}

export interface ModuleMeta {
  name: string;
  description: string;
  active: boolean;
  usage?: string;
  aliases?: string[];
  category?: string;
  ownerOnly?: boolean;
}

export type MessageModule = (context: ModuleContext) => void | Promise<void>;

export function isOwnerNumber(sender: string): boolean {
  if (!/^\d+@s\.whatsapp\.net$/.test(sender)) return false;
  const senderNumber = sender.split("@")[0]!;
  return (process.env.OWNER_NUMBER ?? "")
    .split(",")
    .map((number) => number.replace(/\D/g, ""))
    .filter(Boolean)
    .includes(senderNumber);
}

export async function resolveSenderJid(
  sender: string,
  socket: WAMessageSocket,
): Promise<string> {
  if (!/^\d+@lid$/.test(sender)) return sender;
  try {
    const phoneJid = await (
      socket as WASocket
    ).signalRepository.lidMapping.getPNForLID(sender);
    return phoneJid ? jidNormalizedUser(phoneJid) : sender;
  } catch {
    return sender;
  }
}

export async function isOwnerSender(
  sender: string,
  socket: WAMessageSocket,
): Promise<boolean> {
  return isOwnerNumber(await resolveSenderJid(sender, socket));
}

export interface LoadedMessageModule {
  onMessage: MessageModule;
  meta?: ModuleMeta;
}

type ModuleExports = {
  default?: MessageModule;
  onMessage?: MessageModule;
  meta?: ModuleMeta;
};

async function findModuleFiles(
  directory: string,
  rootDirectory: string,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findModuleFiles(path, rootDirectory);
      if (
        entry.isFile() &&
        /\.(ts|js)$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts") &&
        path !== join(rootDirectory, "index.ts") &&
        path !== join(rootDirectory, "index.js")
      ) {
        return [path];
      }
      return [];
    }),
  );
  return nested.flat().sort();
}

export async function loadMessageModules(): Promise<LoadedMessageModule[]> {
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const files = await findModuleFiles(directory, directory);
  const modules: LoadedMessageModule[] = [];

  for (const file of files) {
    const loaded = (await import(pathToFileURL(file).href)) as ModuleExports;
    const onMessage = loaded.onMessage ?? loaded.default;
    if (typeof onMessage !== "function") continue;

    if (
      !loaded.meta ||
      !loaded.meta.name ||
      !loaded.meta.description ||
      typeof loaded.meta.active !== "boolean"
    ) {
      console.warn(`Metadata module tidak valid: ${file}`);
      continue;
    }
    if (!loaded.meta.active) continue;

    const moduleMeta = {
      ...loaded.meta,
      category:
        loaded.meta.category ??
        (relative(directory, dirname(file))
          .split(sep)
          .filter(Boolean)
          .join(" / ") ||
          "general"),
    };
    modules.push({ onMessage, meta: moduleMeta });
  }

  return modules;
}

export async function dispatchMessage(
  modules: LoadedMessageModule[],
  context: Omit<ModuleContext, "modules">,
): Promise<void> {
  const command = context.message.command();
  if (!command) return;
  const owner = await isOwnerSender(context.message.sender, context.socket);
  const moduleContext = {
    ...context,
    modules: modules.flatMap((module) =>
      module.meta && (owner || !module.meta.ownerOnly) ? [module.meta] : [],
    ),
  };

  const module = modules.find(
    ({ meta }) =>
      meta &&
      (meta.name === command.name || meta.aliases?.includes(command.name)) &&
      (owner || !meta.ownerOnly),
  );
  if (!module) return;

  const started = performance.now();
  let status: "ok" | "error" = "ok";
  try {
    await module.onMessage(moduleContext);
  } catch (error) {
    status = "error";
    console.error(
      `Module ${module.meta?.name ?? "(tanpa nama)"} gagal:`,
      error,
    );
    try {
      getAnalytics().recordError(`command.${module.meta!.name}`, error);
    } catch (loggingError) {
      console.error("Gagal mencatat error modul:", loggingError);
    }
  } finally {
    try {
      const analytics = getAnalytics();
      analytics.recordCommand({
        name: module.meta!.name,
        sender: context.message.sender,
        chatId: context.message.chatId,
        status,
        durationMs: performance.now() - started,
      });
      analytics.recordActivity(
        `command.${module.meta!.name}`,
        context.message.chatId,
        context.message.sender,
      );
    } catch (loggingError) {
      console.error("Gagal mencatat statistik command:", loggingError);
    }
  }
}
