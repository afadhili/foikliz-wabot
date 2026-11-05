import { clearPending, getQueueStats } from "../../analytics/runtime";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "queue",
  active: true,
  ownerOnly: true,
  description: "Lihat status antrean atau hapus pekerjaan tertunda dengan konfirmasi.",
  usage: ".queue [clear CONFIRM]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const rest = message.command()?.rest ?? "";
  if (rest === "clear CONFIRM") {
    const removed = clearPending();
    await message.reply(`Antrean dibersihkan: ${removed} pekerjaan tertunda dihapus. Pekerjaan aktif tetap berjalan.`);
    return;
  }
  if (rest) {
    await message.reply("Gunakan .queue untuk status atau .queue clear CONFIRM untuk menghapus pekerjaan tertunda.");
    return;
  }
  const stats = getQueueStats();
  await message.reply(
    [
      "*Status antrean*",
      `Aktif: ${stats.active}`,
      `Tertunda: ${stats.pending}`,
      `Selesai: ${stats.completed}`,
      `Gagal: ${stats.failed}`,
    ].join("\n"),
  );
};
