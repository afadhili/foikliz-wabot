import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ParsedMessage } from "../parser";

export interface ModuleContext {
  message: ParsedMessage;
  socket: WAMessageSocket;
  modules: ModuleMeta[];
}

export interface WAMessageSocket {
  sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
}

export interface ModuleMeta {
  /** Nama command/module, tanpa prefix. */
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  /** Otomatis diisi dari folder module saat loader dijalankan. */
  category?: string;
}

export type MessageModule = (context: ModuleContext) => void | Promise<void>;

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

    if (loaded.meta && (!loaded.meta.name || !loaded.meta.description)) {
      console.warn(`Metadata module tidak valid: ${file}`);
      continue;
    }
    const moduleMeta = loaded.meta
      ? {
          ...loaded.meta,
          category:
            relative(directory, dirname(file))
              .split(sep)
              .filter(Boolean)
              .join(" / ") || "general",
        }
      : undefined;
    modules.push({ onMessage, meta: moduleMeta });
  }

  return modules;
}

export async function dispatchMessage(
  modules: LoadedMessageModule[],
  context: Omit<ModuleContext, "modules">,
): Promise<void> {
  const moduleContext = {
    ...context,
    modules: modules.flatMap((module) => (module.meta ? [module.meta] : [])),
  };

  for (const module of modules) {
    try {
      await module.onMessage(moduleContext);
    } catch (error) {
      console.error(
        `Module ${module.meta?.name ?? "(tanpa nama)"} gagal:`,
        error,
      );
    }
  }
}
