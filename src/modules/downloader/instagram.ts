import type { MessageModule, ModuleMeta } from "../index";
import { downloadMedia, isAllowedUrl, sendDownloadedMedia } from "./common";

export const meta: ModuleMeta = {
  name: "instagram",
  description: "Unduh video atau Reels dari Instagram sebagai MP4.",
  usage: "URL",
  ai: {
    description: "Unduh satu video atau Reel Instagram publik sebagai MP4.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL video atau Reel Instagram." },
      },
      required: ["url"],
    },
    requirements: [
      "URL harus berasal dari instagram.com atau instagr.am.",
      "Akun/media harus dapat diakses publik.",
    ],
  },
};

async function runInstagram(
  message: Parameters<MessageModule>[0]["message"],
  url: string,
): Promise<string> {
  if (!isAllowedUrl(url, ["instagram.com", "instagr.am"])) {
    return "URL tidak valid. Gunakan tautan publik dari Instagram.";
  }
  await message.reply("Sedang mengunduh media Instagram...");
  const media = await downloadMedia(url, { format: "mp4" });
  await sendDownloadedMedia(
    (content) => message.reply(content),
    media,
    "mp4",
    "Media Instagram",
  );
  return "Media Instagram berhasil diunduh dan dikirim.";
}

export async function executeAI(
  context: Pick<Parameters<MessageModule>[0], "message" | "modules">,
  args: Record<string, unknown>,
): Promise<string> {
  return runInstagram(context.message, String(args.url ?? ""));
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "instagram") return;

  const url = command.args[0];
  if (!url) {
    await message.reply(
      "Format: instagram URL (gunakan tautan Instagram publik).",
    );
    return;
  }
  try {
    const result = await runInstagram(message, url);
    if (result.startsWith("URL tidak valid")) await message.reply(result);
  } catch (error) {
    await message.reply(
      `Gagal mengunduh Instagram: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
