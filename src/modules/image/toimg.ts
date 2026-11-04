import type { ParsedMessage } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";
import { convertImageWithFfmpeg } from "../utils/ffmpeg";

export const meta: ModuleMeta = {
  name: "toimg",
  active: true,
  description: "Ubah sticker menjadi gambar PNG.",
  usage: "(reply sticker)",
};

async function convertSticker(message: ParsedMessage): Promise<string> {
  const hasSticker =
    (message.hasMedia && message.type === "stickerMessage") ||
    (message.quoted?.hasMedia && message.quoted.type === "stickerMessage");
  if (!hasSticker)
    return "Kirim atau reply sebuah sticker agar bisa diubah menjadi gambar.";

  const media = await message.downloadAnyMedia();
  if (!media) return "Sticker tidak dapat diunduh. Coba kirim ulang.";
  const image = await convertImageWithFfmpeg(media, "png");
  await message.reply({ image, mimetype: "image/png" });
  return "Sticker berhasil diubah menjadi gambar.";
}

export const onMessage: MessageModule = async ({ message }) => {
  if (message.command()?.name !== "toimg") return;
  try {
    const result = await convertSticker(message);
    if (result !== "Sticker berhasil diubah menjadi gambar.")
      await message.reply(result);
  } catch (error) {
    console.error("Gagal mengubah sticker menjadi gambar:", error);
    await message.reply("Gagal mengubah sticker ini menjadi gambar.");
  }
};
