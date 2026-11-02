import type { MessageModule, ModuleMeta } from "../index";
import {
  downloadMedia,
  isAllowedUrl,
  sendDownloadedMedia,
  type DownloadFormat,
} from "./common";

export const meta: ModuleMeta = {
  name: "tiktok",
  description: "Unduh video atau audio dari TikTok.",
  usage: "URL [mp4|mp3]",
  ai: {
    description:
      "Unduh media TikTok publik dan kirim sebagai video atau audio.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL video TikTok publik." },
        format: {
          type: "string",
          description:
            "Format hasil: mp4 untuk video atau mp3 untuk audio; default mp4.",
          enum: ["mp4", "mp3"],
        },
      },
      required: ["url"],
    },
    requirements: [
      "URL harus berasal dari tiktok.com.",
      "Satu video per permintaan.",
    ],
  },
};

async function runTikTok(
  message: Parameters<MessageModule>[0]["message"],
  url: string,
  formatValue: unknown,
): Promise<string> {
  const format: DownloadFormat = formatValue === "mp3" ? "mp3" : "mp4";
  if (!isAllowedUrl(url, ["tiktok.com"])) {
    return "URL tidak valid. Gunakan tautan publik dari domain TikTok.";
  }
  await message.reply("Sedang mengunduh media TikTok...");
  const media = await downloadMedia(url, { format });
  await sendDownloadedMedia(
    (content) => message.reply(content),
    media,
    format,
    "Video TikTok",
  );
  return "Media TikTok berhasil diunduh dan dikirim.";
}

export async function executeAI(
  context: Pick<Parameters<MessageModule>[0], "message" | "modules">,
  args: Record<string, unknown>,
): Promise<string> {
  return runTikTok(context.message, String(args.url ?? ""), args.format);
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "tiktok") return;

  const url = command.args[0];
  const format = (command.args[1] ?? "mp4").toLowerCase();
  if (!url || !["mp4", "mp3"].includes(format)) {
    await message.reply("Format: tiktok URL [mp4|mp3]");
    return;
  }
  try {
    const result = await runTikTok(message, url, format);
    if (result.startsWith("URL tidak valid")) await message.reply(result);
  } catch (error) {
    await message.reply(
      `Gagal mengunduh TikTok: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
