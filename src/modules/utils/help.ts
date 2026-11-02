import { getCommandPrefixes } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "help",
  description: "Tampilkan daftar command yang tersedia.",
  ai: {
    description: "Tampilkan daftar seluruh command yang terdaftar di module.",
    parameters: { type: "object", properties: {} },
  },
};

export async function executeAI({
  modules,
}: {
  modules: ModuleMeta[];
}): Promise<string> {
  const prefixes = getCommandPrefixes();
  const lines = modules
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "id"))
    .map((command) => {
      const usage = command.usage ? ` ${command.usage}` : "";
      return `- ${prefixes[0]}${command.name}${usage}: ${command.description}`;
    });
  return `Command yang tersedia:\n${lines.join("\n")}`;
}

export const onMessage: MessageModule = async ({ message, modules }) => {
  if (message.command()?.name !== "help") return;

  const commands = modules
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "id"))
    .map((command) => {
      const prefixes = getCommandPrefixes();
      const usage = command.usage ? ` ${command.usage}` : "";
      const aliases = command.aliases?.length
        ? `\n   Alias: ${command.aliases.join(", ")}`
        : "";
      return `- *${prefixes[0]}${command.name}${usage}*${aliases}\n  ${command.description}`;
    });

  const body = commands.length
    ? commands.join("\n")
    : "Belum ada command yang tersedia.";
  const prefixes = getCommandPrefixes();
  await message.reply(
    `*DAFTAR COMMAND*\nPrefix: ${prefixes.join(" | ")}\nTotal: ${commands.length}\n\n${body}`,
  );
};
