import type { MessageModule, ModuleMeta } from "../index";
import {
  downloadMedia,
  isAllowedUrl,
  sendDownloadedMedia,
  type DownloadFormat,
} from "./common";

export const meta: ModuleMeta = {
  name: "tiktok",
  active: true,
  aliases: ["tt"],
  description: "Unduh video atau audio dari TikTok.",
  usage: "URL [mp4|mp3]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "tiktok" && command?.name !== "tt") return;

  const url = command.args[0];
  const format = (command.args[1] ?? "mp4").toLowerCase() as DownloadFormat;
  if (!url || !["mp4", "mp3"].includes(format)) {
    await message.reply("Format: tiktok URL [mp4|mp3]");
    return;
  }
  if (!isAllowedUrl(url, ["tiktok.com"])) {
    await message.reply("URL tidak valid. Gunakan tautan dari domain TikTok.");
    return;
  }

  await message.react("⏳");
  try {
    const media = await downloadMedia(url, { format });
    await sendDownloadedMedia(
      (content) => message.reply(content),
      media,
      format,
      "Video TikTok",
    );
    await message.react("👌");
  } catch (error) {
    await message.reply(
      `Gagal mengunduh TikTok: ${error instanceof Error ? error.message : String(error)}`,
    );
    await message.react("❌");
  }
};
