import { getAnalytics } from "../../analytics/store";
import type { MessageModule, ModuleMeta } from "../index";

const MAX_BACKUP_SIZE = 32 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "application/vnd.sqlite3",
  "application/octet-stream",
]);

export const meta: ModuleMeta = {
  name: "dbrestore",
  active: true,
  ownerOnly: true,
  description:
    "Pulihkan basis data dari dokumen SQLite yang dibalas di chat pribadi.",
  usage: "CONFIRM (reply dokumen cadangan, maksimal 32 MB)",
};

export const onMessage: MessageModule = async ({ message }) => {
  if (message.isGroup) {
    console.info("Pemulihan basis data ditolak: chat grup.");
    await message.reply(
      "Pemulihan basis data hanya dapat dilakukan di chat pribadi.",
    );
    return;
  }

  const quoted = message.quoted;
  if (
    message.command()?.rest !== "CONFIRM" ||
    quoted?.type !== "documentMessage" ||
    !ALLOWED_MIMES.has(quoted.mimetype ?? "")
  ) {
    await message.reply(
      "Balas dokumen cadangan SQLite (maksimal 32 MB) dengan .dbrestore CONFIRM. Hanya dokumen SQLite atau octet-stream yang diterima.",
    );
    return;
  }

  const declaredSize = Number(
    quoted.raw.message?.documentMessage?.fileLength ?? 0,
  );
  if (
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 1 ||
    declaredSize > MAX_BACKUP_SIZE
  ) {
    console.info("Pemulihan basis data ditolak: ukuran dokumen tidak valid.");
    await message.reply("Ukuran dokumen tidak valid atau melebihi 32 MB.");
    return;
  }

  try {
    const analytics = getAnalytics();
    analytics.recordActivity("dbrestore.attempt");
    const downloaded = await message.downloadMediaFromQuote();
    if (!downloaded) throw new Error("Unduhan dokumen gagal");
    const backup = Buffer.from(downloaded);
    if (backup.length > MAX_BACKUP_SIZE || backup.length < 16) {
      console.info(
        "Pemulihan basis data ditolak: ukuran cadangan tidak valid.",
      );
      await message.reply("Ukuran dokumen tidak valid. Maksimal 32 MB.");
      return;
    }
    if (backup.toString("ascii", 0, 16) !== "SQLite format 3\0") {
      console.info("Pemulihan basis data ditolak: bukan berkas SQLite.");
      await message.reply("Dokumen bukan basis data SQLite yang valid.");
      return;
    }

    analytics.restore(backup);
    analytics.recordActivity("dbrestore.success");
    console.info("Pemulihan basis data berhasil.");
    await message.reply("Basis data berhasil dipulihkan.");
  } catch (error) {
    try {
      getAnalytics().recordError("dbrestore", error);
    } catch {
      // Jangan sampai kegagalan pencatatan menutupi pesan kegagalan pemulihan.
    }
    console.error("Pemulihan basis data gagal.");
    await message.reply("Gagal memulihkan basis data. Periksa log bot.");
  }
};
