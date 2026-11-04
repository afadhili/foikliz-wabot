import type { MessageModule, ModuleMeta } from "../index";
import {
  downloadMedia,
  isAllowedUrl,
  sendDownloadedMedia,
  type DownloadFormat,
} from "./common";

const RESOLUTIONS = [360, 480, 720, 1080] as const;
type Resolution = (typeof RESOLUTIONS)[number];

export const meta: ModuleMeta = {
  name: "youtube",
  aliases: ["yt"],
  description: "Unduh video atau audio YouTube dengan pilihan resolusi.",
  usage: "URL [mp4|mp3] [360|480|720|1080]",
};

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "youtube") return;

  const url = command.args[0];
  const format = (command.args[1] ?? "mp4").toLowerCase() as DownloadFormat;
  const resolution = Number(command.args[2] ?? 720);
  if (
    !url ||
    !["mp4", "mp3"].includes(format) ||
    !RESOLUTIONS.includes(resolution as Resolution)
  ) {
    await message.reply("Format: youtube URL [mp4|mp3] [360|480|720|1080]");
    return;
  }
  if (!isAllowedUrl(url, ["youtube.com", "youtu.be", "youtube-nocookie.com"])) {
    await message.reply("URL tidak valid. Gunakan tautan dari YouTube.");
    return;
  }

  await message.reply(
    `Sedang mengunduh YouTube ${format.toUpperCase()}${format === "mp4" ? ` ${resolution}p` : ""}...`,
  );
  try {
    const media = await downloadMedia(url, {
      format,
      resolution: resolution as Resolution,
    });
    await sendDownloadedMedia(
      (content) => message.reply(content),
      media,
      format,
      `Video YouTube (${resolution}p)`,
    );
  } catch (error) {
    await message.reply(
      `Gagal mengunduh YouTube: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
