import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "msgstats",
  active: true,
  ownerOnly: true,
  description: "Lihat jumlah pesan hari ini dan jenis pesan yang diterima bot.",
};

export const onMessage: MessageModule = async ({ message }) => {
  const { today, byType } = getAnalytics().messageStats();
  await message.reply(
    [
      "*Statistik pesan*",
      `Hari ini (UTC): ${today}`,
      "",
      "*Berdasarkan jenis*",
      ...(byType.length
        ? byType.map(({ type, count }) => `• ${type.replace(/Message$/, "")}: ${count}`)
        : ["Belum ada pesan tercatat."]),
    ].join("\n"),
  );
};
