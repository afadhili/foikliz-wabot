import type { ParsedMessage } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";
import { convertImageWithFfmpeg } from "../utils/ffmpeg";

export const meta: ModuleMeta = {
  name: "toimg",
  description: "Ubah sticker menjadi gambar PNG.",
  usage: "(reply sticker)",
  ai: {
    description:
      "Ubah sticker pada pesan saat ini atau sticker yang dikutip menjadi PNG.",
    parameters: { type: "object", properties: {} },
    requirements: ["Pesan atau pesan kutipan harus berisi sticker."],
  },
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

export async function executeAI(context: {
  message: ParsedMessage;
}): Promise<string> {
  return convertSticker(context.message);
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
