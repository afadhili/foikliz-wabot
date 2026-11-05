import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "stats",
  active: true,
  ownerOnly: true,
  description: "Lihat ringkasan statistik bot dan perintah terpopuler.",
  usage: ".stats",
};

export const onMessage: MessageModule = async ({ message }) => {
  const analytics = getAnalytics();
  const stats = analytics.summary();
  const top = analytics.topCommands(5);
  await message.reply(
    [
      "*Statistik bot*",
      `Pengguna: ${stats.users}`,
      `Grup: ${stats.groups}`,
      `Pesan: ${stats.messages}`,
      `Pengguna aktif harian: ${stats.dau}`,
      `Total perintah: ${stats.totalCommands}`,
      `Kesalahan: ${stats.errors}`,
      "",
      "*Perintah terpopuler*",
      ...(top.length ? top.map(({ name, count }) => `${name}: ${count}`) : ["Belum ada data."]),
    ].join("\n"),
  );
};
