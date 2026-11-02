import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const MAX_OUTPUT_SIZE = 64 * 1024 * 1024;

export async function convertImageWithFfmpeg(
  input: Buffer,
  format: "webp" | "png",
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "foikliz-convert-"));
  const inputPath = join(directory, "input.bin");
  const outputPath = join(directory, `output.${format}`);
  await writeFile(inputPath, input);

  const outputOptions =
    format === "webp"
      ? [
          "-vf",
          "scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos",
          "-frames:v",
          "1",
          "-an",
          "-c:v",
          "libwebp",
          "-quality",
          "65",
          "-compression_level",
          "6",
          "-loop",
          "0",
        ]
      : [
          "-vf",
          "scale=2048:2048:force_original_aspect_ratio=decrease:flags=lanczos",
          "-frames:v",
          "1",
          "-an",
          "-c:v",
          "png",
        ];

  try {
    await execFile(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        ...outputOptions,
        outputPath,
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true },
    );

    const { size } = await stat(outputPath);
    if (size > MAX_OUTPUT_SIZE) {
      throw new Error("Hasil konversi melebihi batas 64 MB.");
    }
    return await readFile(outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      throw new Error("FFmpeg tidak ditemukan. Pastikan ffmpeg tersedia di PATH.");
    }
    if (message.includes("timed out")) {
      throw new Error("Konversi FFmpeg melewati batas waktu 60 detik.");
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
