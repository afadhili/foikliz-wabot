import { execFile as execFileCallback } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export async function transcribeAudio(audio: Buffer): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "foikliz-transcribe-"));
  const inputPath = join(directory, "audio.mp3");
  const wavPath = join(directory, "audio.wav");
  const outputPrefix = join(directory, "transcript");
  const outputPath = `${outputPrefix}.txt`;
  const whisperDirectory = resolve(process.cwd(), ".tools/whisper.cpp");
  const executable = resolve(
    process.env.WHISPER_CPP_PATH ||
      join(whisperDirectory, "build/bin/whisper-cli"),
  );
  const model = resolve(
    process.env.WHISPER_MODEL_PATH ||
      join(whisperDirectory, "models/ggml-base.bin"),
  );

  try {
    await writeFile(inputPath, audio);
    await execFile(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        wavPath,
      ],
      { timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true },
    );

    await access(executable).catch(() => {
      throw new Error(
        "whisper-cli belum tersedia. Jalankan: bun run setup:whisper",
      );
    });
    await access(model).catch(() => {
      throw new Error(
        "Model Whisper base belum tersedia. Jalankan: bun run setup:whisper",
      );
    });

    await execFile(
      executable,
      [
        "-m",
        model,
        "-f",
        wavPath,
        "-l",
        "auto",
        "-nt",
        "-otxt",
        "-of",
        outputPrefix,
        "-np",
        "-t",
        process.env.WHISPER_THREADS || "4",
      ],
      { timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    );

    return (await readFile(outputPath, "utf8")).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      throw new Error(
        "FFmpeg tidak ditemukan. Pastikan ffmpeg tersedia di PATH.",
      );
    }
    if (message.includes("timed out")) {
      throw new Error("Transkripsi melewati batas waktu 15 menit.");
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
