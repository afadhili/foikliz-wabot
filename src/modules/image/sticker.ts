import type { ParsedMessage } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";
import { convertImageWithFfmpeg } from "../utils/ffmpeg";

const SUPPORTED_MEDIA_TYPES = new Set(["imageMessage", "stickerMessage"]);

export const meta: ModuleMeta = {
  name: "sticker",
  active: true,
  aliases: ["s"],
  description: "Ubah gambar menjadi sticker terkompresi.",
  usage: "(kirim bersama gambar atau reply gambar)",
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

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "sticker" && command?.name !== "s") return;
  try {
    await message.react("⏳");
    const result = await makeSticker(message);
    if (result !== "Sticker berhasil dibuat.") {
      await message.reply(result);
      await message.react("👌");
    }
  } catch (error) {
    console.error("Gagal mengubah media menjadi sticker:", error);
    await message.reply("Gagal mengubah media. Format yang didukung: gambar.");
    await message.react("❌");
  }
};
