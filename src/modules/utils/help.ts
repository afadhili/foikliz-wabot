import { getCommandPrefixes } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "help",
  active: true,
  description: "Tampilkan daftar command yang tersedia.",
  usage: "[nama command]",
};

const DEFAULT_CATEGORY = "general";
const collator = new Intl.Collator("id");

const byName = (left: ModuleMeta, right: ModuleMeta) =>
  collator.compare(left.name, right.name);

const categoryLabel = (category: string) =>
  category === DEFAULT_CATEGORY ? "umum" : category;

function groupByCategory(modules: ModuleMeta[]) {
  const groups = new Map<string, ModuleMeta[]>();
  for (const module of modules) {
    const category = module.category ?? DEFAULT_CATEGORY;
    const group = groups.get(category);
    if (group) group.push(module);
    else groups.set(category, [module]);
  }
  return groups;
}

function formatCommand(module: ModuleMeta, prefix: string) {
  const aliases = module.aliases?.length
    ? ` (alias: ${module.aliases.join(", ")})`
    : "";
  return `> ${prefix}${module.name}${aliases}`;
}

function formatDetail(module: ModuleMeta, prefix: string) {
  const lines = [
    `*${prefix}${module.name}*`,
    module.description,
    `${prefix}${module.name}${module.usage ? ` ${module.usage}` : ""}`,
  ];
  if (module.aliases?.length) {
    lines.push(`Alias: ${module.aliases.join(", ")}`);
  }
  return lines.join("\n");
}

export const onMessage: MessageModule = async ({ message, modules }) => {
  const command = message.command();
  if (command?.name !== "help") return;

  const prefixes = getCommandPrefixes();
  const prefix = prefixes[0] ?? "";

  const query = command.args?.[0]?.toLowerCase().replace(/^\W+/, "");
  if (query) {
    const found = modules.find(
      (module) =>
        module.name.toLowerCase() === query ||
        module.aliases?.some((alias) => alias.toLowerCase() === query),
    );
    await message.reply(
      found
        ? formatDetail(found, prefix)
        : `Command "${query}" tidak ditemukan. Ketik ${prefix}help untuk melihat daftar.`,
    );
    return;
  }

  const sections = [...groupByCategory(modules)]
    .sort(([left], [right]) => collator.compare(left, right))
    .map(([category, group]) => {
      const entries = [...group]
        .sort(byName)
        .map((module) => formatCommand(module, prefix));
      return `*${categoryLabel(category)}:*\n${entries.join("\n")}`;
    });

  const header = [
    "*Relayz Bot*",
    `> Prefix: ${prefixes.join("  ")}`,
    `> Detail: ${prefix}help <nama command>`,
  ].join("\n");

  await message.sendWithBanner(
    `${header}\n\n${sections.join("\n\n") || "Belum ada command yang tersedia."}`,
  );
};
