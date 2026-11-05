import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const MAX_OUTPUT_SIZE = 64 * 1024 * 1024;

const MAX_ANIMATED_STICKER_SIZE = 1 * 1024 * 1024;
const MAX_VIDEO_INPUT_SIZE = 32 * 1024 * 1024;
const STICKER_SIZE = 512;

async function assertCroppable(inputPath: string): Promise<void> {
  const { stdout } = await execFile(
    process.env.FFPROBE_PATH || "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      inputPath,
    ],
    { timeout: 10_000, windowsHide: true },
  );
  const info = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
  };
  const stream = info.streams?.[0];
  if (!stream || !stream.width || !stream.height) {
    throw new Error("Dimensi media tidak dapat dibaca.");
  }
  if (stream.width < STICKER_SIZE || stream.height < STICKER_SIZE) {
    throw new Error(
      "Mode crop memerlukan gambar/video minimal 512×512 piksel agar tidak perlu di-resize.",
    );
  }
}

/** Konversi potongan awal video menjadi sticker WebP animasi (bukan GIF). */
export async function convertVideoToSticker(
  input: Buffer,
  crop = false,
): Promise<Buffer> {
  if (input.length > MAX_VIDEO_INPUT_SIZE) {
    throw new Error("Video terlalu besar (maksimal 32 MB).");
  }

  const directory = await mkdtemp(join(tmpdir(), "foikliz-video-sticker-"));
  const inputPath = join(directory, "input.mp4");
  try {
    await writeFile(inputPath, input);
    if (crop) await assertCroppable(inputPath);
    for (const [size, fps, quality] of [
      [512, 10, 55],
      [384, 8, 40],
      [320, 6, 30],
    ]) {
      const outputPath = join(directory, `sticker-${size}.webp`);
      await execFile(
        process.env.FFMPEG_PATH || "ffmpeg",
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          inputPath,
          "-t",
          "6",
          "-vf",
          crop
            ? `fps=${fps},crop=512:512:(iw-ow)/2:(ih-oh)/2,format=yuva420p`
            : `fps=${fps},scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p`,
          "-an",
          "-c:v",
          "libwebp_anim",
          "-lossless",
          "0",
          "-quality",
          String(quality),
          "-loop",
          "0",
          outputPath,
        ],
        { timeout: 90_000, maxBuffer: 1024 * 1024, windowsHide: true },
      );
      if ((await stat(outputPath)).size <= MAX_ANIMATED_STICKER_SIZE) {
        return await readFile(outputPath);
      }
    }
    throw new Error(
      "Sticker animasi melebihi batas 1 MB. Coba video yang lebih sederhana.",
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      throw new Error(
        "FFmpeg tidak ditemukan. Pastikan ffmpeg tersedia di PATH.",
      );
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function convertImageWithFfmpeg(
  input: Buffer,
  format: "webp" | "png",
  crop = false,
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "foikliz-convert-"));
  const inputPath = join(directory, "input.bin");
  const outputPath = join(directory, `output.${format}`);
  await writeFile(inputPath, input);

  const outputOptions =
    format === "webp"
      ? [
          "-vf",
          crop
            ? "crop=512:512:(iw-ow)/2:(ih-oh)/2"
            : "scale=512:512:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos",
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
    if (format === "webp" && crop) await assertCroppable(inputPath);
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
      throw new Error(
        "FFmpeg tidak ditemukan. Pastikan ffmpeg tersedia di PATH.",
      );
    }
    if (message.includes("timed out")) {
      throw new Error("Konversi FFmpeg melewati batas waktu 60 detik.");
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
