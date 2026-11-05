import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "dbbackup",
  active: true,
  ownerOnly: true,
  description: "Kirim cadangan basis data SQLite ke chat pribadi pemilik.",
  usage: ".dbbackup",
};

export const onMessage: MessageModule = async ({ message }) => {
  if (message.isGroup) {
    await message.reply("Cadangan basis data hanya dapat dikirim di chat pribadi.");
    return;
  }

  try {
    const backup = getAnalytics().backup();
    await message.reply({
      document: backup,
      mimetype: "application/vnd.sqlite3",
      fileName: "bot-backup.sqlite",
    });
  } catch {
    console.error("Gagal membuat atau mengirim cadangan basis data.");
    await message.reply("Gagal mengirim cadangan basis data. Periksa log bot.");
  }
};
