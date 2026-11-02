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
  description: "Unduh video atau audio YouTube dengan pilihan resolusi.",
  usage: "URL [mp4|mp3] [360|480|720|1080]",
  ai: {
    description:
      "Unduh video atau audio YouTube; resolusi hanya berlaku untuk video.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL video YouTube." },
        format: {
          type: "string",
          description: "Format hasil, mp4 (default) atau mp3.",
          enum: ["mp4", "mp3"],
        },
        resolution: {
          type: "integer",
          description: "Resolusi video maksimum; default 720.",
          enum: [...RESOLUTIONS],
        },
      },
      required: ["url"],
    },
    requirements: [
      "URL harus dari youtube.com atau youtu.be.",
      "Satu video per permintaan.",
    ],
  },
};

async function runYouTube(
  message: Parameters<MessageModule>[0]["message"],
  url: string,
  formatValue: unknown,
  resolutionValue: unknown,
): Promise<string> {
  const format: DownloadFormat = formatValue === "mp3" ? "mp3" : "mp4";
  const resolution = RESOLUTIONS.includes(Number(resolutionValue) as Resolution)
    ? (Number(resolutionValue) as Resolution)
    : 720;
  if (!isAllowedUrl(url, ["youtube.com", "youtu.be", "youtube-nocookie.com"])) {
    return "URL tidak valid. Gunakan tautan publik dari YouTube.";
  }
  await message.reply(
    `Sedang mengunduh YouTube ${format.toUpperCase()}${format === "mp4" ? ` ${resolution}p` : ""}...`,
  );
  const media = await downloadMedia(url, { format, resolution });
  await sendDownloadedMedia(
    (content) => message.reply(content),
    media,
    format,
    `Video YouTube (${resolution}p)`,
  );
  return "Media YouTube berhasil diunduh dan dikirim.";
}

export async function executeAI(
  context: Pick<Parameters<MessageModule>[0], "message" | "modules">,
  args: Record<string, unknown>,
): Promise<string> {
  return runYouTube(
    context.message,
    String(args.url ?? ""),
    args.format,
    args.resolution,
  );
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "youtube") return;

  const url = command.args[0];
  const format = (command.args[1] ?? "mp4").toLowerCase();
  const resolution = Number(command.args[2] ?? 720);
  if (
    !url ||
    !["mp4", "mp3"].includes(format) ||
    !RESOLUTIONS.includes(resolution as Resolution)
  ) {
    await message.reply("Format: youtube URL [mp4|mp3] [360|480|720|1080]");
    return;
  }
  try {
    const result = await runYouTube(message, url, format, resolution);
    if (result.startsWith("URL tidak valid")) await message.reply(result);
  } catch (error) {
    await message.reply(
      `Gagal mengunduh YouTube: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
