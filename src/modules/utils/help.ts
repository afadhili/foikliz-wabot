import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "help",
  active: true,
  description:
    "Lihat kategori, daftar perintah kategori, atau detail satu perintah.",
  usage: "[kategori | nama command]",
};

const DEFAULT_CATEGORY = "general";
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  downloader: "Unduh media dan transkripsi dari tautan.",
  group: "Perintah untuk percakapan grup.",
  image: "Edit gambar dan buat sticker.",
  owner: "Perintah khusus pemilik bot.",
  tools: "Alat bantu sehari-hari.",
  utils: "Informasi dan bantuan bot.",
  general: "Perintah lainnya.",
};
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

function formatDetail(module: ModuleMeta, prefix: string) {
  const category = module.category ?? DEFAULT_CATEGORY;
  const usage = module.usage?.startsWith(`.${module.name}`)
    ? module.usage.slice(module.name.length + 1).trim()
    : module.usage;
  return [
    `*${prefix}${module.name}*`,
    `Kategori: ${categoryLabel(category)}`,
    "",
    module.description,
    "",
    "*Cara pakai*",
    `\`${prefix}${module.name}${usage ? ` ${usage}` : ""}\``,
    ...(module.aliases?.length
      ? [
          `Alias: ${module.aliases.map((alias) => `${prefix}${alias}`).join(", ")}`,
        ]
      : []),
  ].join("\n");
}

function formatCategory(category: string, group: ModuleMeta[], prefix: string) {
  return [
    `*${categoryLabel(category)}*`,
    CATEGORY_DESCRIPTIONS[category] ??
      `Perintah dalam kategori ${categoryLabel(category)}.`,
    "",
    ...[...group].sort(byName).map((module) => `> *${prefix}${module.name}*`),
    "",
  ].join("\n");
}

export const onMessage: MessageModule = async ({ message, modules }) => {
  const command = message.command();
  if (command?.name !== "help") return;

  const prefix = command.prefix;
  const categories = groupByCategory(modules);
  const query = command.args[0]?.toLowerCase().replace(/^\W+/, "");

  if (query) {
    const found = modules.find(
      (module) =>
        module.name.toLowerCase() === query ||
        module.aliases?.some((alias) => alias.toLowerCase() === query),
    );
    if (found) {
      await message.reply(formatDetail(found, prefix));
      return;
    }
    const category = [...categories.keys()].find(
      (name) => name.toLowerCase() === query || categoryLabel(name) === query,
    );
    if (category) {
      await message.replyWithBanner(
        formatCategory(category, categories.get(category)!, prefix),
      );
      return;
    }
    await message.reply(
      `"${query}" tidak ditemukan. Ketik ${prefix}help untuk melihat kategori yang tersedia.`,
    );
    return;
  }

  const sections = [...categories.keys()]
    .sort((left, right) => collator.compare(left, right))
    .map((category) => `> ${categoryLabel(category)}`);

  await message.sendWithBanner(
    [
      "*Kategori Bot*",
      sections.join("\n") || "Belum ada kategori yang tersedia.",
      "",
      `Lihat kategori: ${prefix}help <kategori>`,
      `Detail perintah: ${prefix}help <command>`,
    ].join("\n"),
  );
};
