import type { MessageModule, ModuleMeta } from "../index";
import { downloadMedia, isAllowedUrl, sendDownloadedMedia } from "./common";

export const meta: ModuleMeta = {
  name: "instagram",
  active: false,
  aliases: ["ig"],
  description: "Unduh video atau Reels dari Instagram sebagai MP4.",
  usage: "URL",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "instagram" && command?.name !== "ig") return;

  const url = command.args[0];
  if (!url || !isAllowedUrl(url, ["instagram.com", "instagr.am"])) {
    await message.reply(
      "Format: instagram URL (gunakan tautan Instagram publik).",
    );
    return;
  }

  await message.react("⏳");
  try {
    const media = await downloadMedia(url, { format: "mp4" });
    await sendDownloadedMedia(
      (content) => message.reply(content),
      media,
      "mp4",
      "Media Instagram",
    );
    await message.react("👌");
  } catch (error) {
    await message.reply(
      `Gagal mengunduh Instagram: ${error instanceof Error ? error.message : String(error)}`,
    );
    await message.react("❌");
  }
};
