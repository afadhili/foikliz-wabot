import type { ParsedMessage } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";
import { convertImageWithFfmpeg, convertVideoToSticker } from "../utils/ffmpeg";

const SUPPORTED_MEDIA_TYPES = new Set([
  "imageMessage",
  "stickerMessage",
  "videoMessage",
]);

export const meta: ModuleMeta = {
  name: "sticker",
  active: true,
  aliases: ["s"],
  description:
    "Ubah gambar menjadi sticker atau video menjadi sticker animasi.",
  usage: "[crop] (kirim bersama gambar/video atau reply gambar/video)",
};

async function makeSticker(
  message: ParsedMessage,
  crop: boolean,
): Promise<string> {
  const source =
    message.hasMedia && SUPPORTED_MEDIA_TYPES.has(message.type)
      ? "message"
      : message.quoted?.hasMedia &&
          message.quoted.type &&
          SUPPORTED_MEDIA_TYPES.has(message.quoted.type)
        ? "quote"
        : null;
  if (!source)
    return "Kirim gambar/video atau reply gambar/video untuk membuat sticker.";

  const media =
    source === "message"
      ? await message.downloadMediaMsg()
      : await message.downloadMediaFromQuote();
  if (!media) return "Media tidak dapat diunduh. Coba kirim ulang.";

  const type = source === "message" ? message.type : message.quoted?.type;
  const isAnimated = type === "videoMessage";
  const sticker = isAnimated
    ? await convertVideoToSticker(media, crop)
    : await convertImageWithFfmpeg(media, "webp", crop);
  await message.reply({ sticker, isAnimated });
  return "Sticker berhasil dibuat.";
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "sticker" && command?.name !== "s") return;
  if (
    command.args.length > 1 ||
    (command.args[0] && command.args[0].toLowerCase() !== "crop")
  ) {
    await message.reply(
      `Format: ${command.prefix}${command.name} ${meta.usage}`,
    );
    return;
  }
  const crop = command.args[0]?.toLowerCase() === "crop";
  try {
    await message.react("⏳");
    const result = await makeSticker(message, crop);
    if (result !== "Sticker berhasil dibuat.") {
      await message.reply(result);
      await message.react("👌");
    }
  } catch (error) {
    console.error("Gagal mengubah media menjadi sticker:", error);
    await message.reply(
      `Gagal mengubah media: ${error instanceof Error ? error.message : String(error)}`,
    );
    await message.react("❌");
  }
};
