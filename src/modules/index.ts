import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ParsedMessage } from "../parser";

export interface ModuleContext {
  message: ParsedMessage;
  socket: WAMessageSocket;
  modules: ModuleMeta[];
  aiTools: LoadedMessageModule[];
}

export interface WAMessageSocket {
  sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
}

export interface AIParameterSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: "string" | "number" | "integer" | "boolean";
      description: string;
      enum?: Array<string | number | boolean>;
    }
  >;
  required?: string[];
}

export interface ModuleMeta {
  /** Nama command/module, tanpa prefix. */
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  ai?: {
    description: string;
    parameters: AIParameterSchema;
    requirements?: string[];
  };
}

export type MessageModule = (context: ModuleContext) => void | Promise<void>;
export type AIModuleHandler = (
  context: Pick<ModuleContext, "message" | "modules">,
  args: Record<string, unknown>,
) => Promise<string>;

export interface LoadedMessageModule {
  onMessage: MessageModule;
  executeAI?: AIModuleHandler;
  meta?: ModuleMeta;
}

type ModuleExports = {
  default?: MessageModule;
  onMessage?: MessageModule;
  executeAI?: AIModuleHandler;
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
    modules.push({ onMessage, executeAI: loaded.executeAI, meta: loaded.meta });
  }

  return modules;
}

export async function dispatchMessage(
  modules: LoadedMessageModule[],
  context: Omit<ModuleContext, "modules" | "aiTools">,
): Promise<void> {
  const moduleContext = {
    ...context,
    modules: modules.flatMap((module) => (module.meta ? [module.meta] : [])),
    aiTools: modules.filter((module) => module.meta?.ai && module.executeAI),
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
