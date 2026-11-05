import { clearCache, getCacheStats } from "../../analytics/runtime";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "cache",
  active: true,
  ownerOnly: true,
  description: "Lihat statistik cache atau kosongkan cache dengan konfirmasi.",
  usage: ".cache [clear CONFIRM]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const rest = message.command()?.rest ?? "";
  if (rest === "clear CONFIRM") {
    const removed = clearCache();
    await message.reply(`Cache dikosongkan: ${removed} entri dihapus.`);
    return;
  }
  if (rest) {
    await message.reply("Gunakan .cache untuk statistik atau .cache clear CONFIRM untuk mengosongkan cache.");
    return;
  }
  const stats = getCacheStats();
  await message.reply(
    [
      "*Statistik cache*",
      `Entri: ${stats.entries}`,
      `Hit: ${stats.hits}`,
      `Miss: ${stats.misses}`,
    ].join("\n"),
  );
};
