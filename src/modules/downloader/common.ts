import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const MAX_FILE_SIZE = 64 * 1024 * 1024;

export type DownloadFormat = "mp4" | "mp3";

export interface DownloadOptions {
  format: DownloadFormat;
  resolution?: 360 | 480 | 720 | 1080;
}

export async function downloadMedia(
  url: string,
  options: DownloadOptions,
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "foikliz-download-"));
  const output = join(directory, "%(id)s.%(ext)s");
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--restrict-filenames",
    "--max-filesize",
    "64M",
    "--output",
    output,
    "--print",
    "after_move:filepath",
  ];

  if (options.format === "mp3") {
    args.push(
      "--format",
      "bestaudio/best",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "5",
    );
  } else {
    const maxHeight = options.resolution ?? 720;
    args.push(
      "--format",
      `bestvideo[ext=mp4][height<=${maxHeight}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${maxHeight}]/best[ext=mp4]`,
      "--merge-output-format",
      "mp4",
    );
  }
  args.push(url);

  try {
    const { stdout } = await execFile(
      process.env.YTDLP_PATH || "yt-dlp",
      args,
      {
        timeout: 180_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
    );
    const outputPath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);

    if (!outputPath) throw new Error("yt-dlp tidak mengembalikan file hasil.");

    const filePath = outputPath.startsWith(directory)
      ? outputPath
      : join(directory, outputPath);
    const fileInfo = await stat(filePath);
    if (fileInfo.size > MAX_FILE_SIZE) {
      throw new Error("Ukuran file melebihi batas pengiriman 64 MB.");
    }
    return await readFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      throw new Error("yt-dlp belum terpasang atau tidak ditemukan di PATH.");
    }
    if (message.includes("timed out")) {
      throw new Error("Download melewati batas waktu 3 menit.");
    }
    throw new Error(message);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function isAllowedUrl(value: string, domains: string[]): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const hostname = url.hostname.toLowerCase();
    return domains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export async function sendDownloadedMedia(
  reply: (content: AnyMessageContent) => Promise<unknown>,
  buffer: Buffer,
  format: DownloadFormat,
  caption: string,
) {
  if (format === "mp3") {
    await reply({
      audio: buffer,
      mimetype: "audio/mpeg",
      fileName: "audio.mp3",
    });
    return;
  }
  await reply({ video: buffer, mimetype: "video/mp4", caption });
}
