import type { ParsedMessage } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";
import { downloadMedia, isAllowedUrl } from "./common";
import { transcribeAudio } from "../utils/transcription";

const VIDEO_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "instagram.com",
  "instagr.am",
  "tiktok.com",
];
const MAX_MESSAGE_LENGTH = 3500;

export const meta: ModuleMeta = {
  name: "transcribe",
  active: true,
  description:
    "Transkripsikan video YouTube, Instagram, atau TikTok menjadi teks.",
  usage: "URL video",
};

function splitText(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    let splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH / 2)
      splitAt = remaining.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH / 2) splitAt = MAX_MESSAGE_LENGTH;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function transcribeUrl(
  message: ParsedMessage,
  url: string,
): Promise<string> {
  if (!url || !isAllowedUrl(url, VIDEO_DOMAINS)) {
    return "Kirim URL video publik dari YouTube, Instagram, atau TikTok.";
  }
  await message.reply("Mengunduh audio dan membuat transkrip. Mohon tunggu...");
  const audio = await downloadMedia(url, { format: "mp3" });
  const transcript = await transcribeAudio(audio);
  if (!transcript)
    return "Tidak ada ucapan yang berhasil dikenali dari video tersebut.";

  const parts = splitText(transcript);
  for (let index = 0; index < parts.length; index++) {
    const heading =
      parts.length > 1
        ? `Transkrip (${index + 1}/${parts.length})\n\n`
        : "Transkrip video\n\n";
    await message.reply(`${heading}${parts[index]}`);
  }
  return "Transkripsi selesai dan hasilnya sudah dikirim.";
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "transcribe") return;
  try {
    const result = await transcribeUrl(message, command.args[0] ?? "");
    if (result.startsWith("Kirim URL")) await message.reply(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await message.reply(`Gagal membuat transkrip: ${detail}`);
  }
};
