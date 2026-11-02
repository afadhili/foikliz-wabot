import type { ParsedMessage } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";
import { convertImageWithFfmpeg } from "../utils/ffmpeg";

const SUPPORTED_MEDIA_TYPES = new Set(["imageMessage", "stickerMessage"]);

export const meta: ModuleMeta = {
  name: "sticker",
  description: "Ubah gambar menjadi sticker terkompresi.",
  usage: "(kirim bersama gambar atau reply gambar)",
  ai: {
    description:
      "Ubah gambar pada pesan saat ini atau gambar yang dikutip menjadi sticker WebP.",
    parameters: { type: "object", properties: {} },
    requirements: [
      "Pesan atau pesan kutipan harus berisi gambar atau sticker.",
    ],
  },
};

async function makeSticker(message: ParsedMessage): Promise<string> {
  const source =
    message.hasMedia && SUPPORTED_MEDIA_TYPES.has(message.type)
      ? "message"
      : message.quoted?.hasMedia &&
          message.quoted.type &&
          SUPPORTED_MEDIA_TYPES.has(message.quoted.type)
        ? "quote"
        : null;
  if (!source)
    return "Kirim gambar atau reply sebuah gambar, lalu minta saya membuat sticker.";

  const media =
    source === "message"
      ? await message.downloadMediaMsg()
      : await message.downloadMediaFromQuote();
  if (!media) return "Gambar tidak dapat diunduh. Coba kirim ulang.";

  const sticker = await convertImageWithFfmpeg(media, "webp");
  await message.reply({ sticker });
  return "Sticker berhasil dibuat.";
}

export async function executeAI(context: {
  message: ParsedMessage;
}): Promise<string> {
  return makeSticker(context.message);
}

export const onMessage: MessageModule = async ({ message }) => {
  if (message.command()?.name !== "sticker") return;
  try {
    const result = await makeSticker(message);
    if (result !== "Sticker berhasil dibuat.") await message.reply(result);
  } catch (error) {
    console.error("Gagal mengubah media menjadi sticker:", error);
    await message.reply("Gagal mengubah media. Format yang didukung: gambar.");
  }
};
