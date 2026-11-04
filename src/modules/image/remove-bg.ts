import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";
import sharp from "sharp";
import { getCommandPrefixes } from "../../parser";
import type { ParsedMessage } from "../../parser";
import type { MessageModule, ModuleMeta } from "../index";

const MAX_INPUT_SIZE = 20 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["imageMessage"]);

export const meta: ModuleMeta = {
  name: "bgremover",
  active: true,
  aliases: ["removebg", "rbg"],
  description: "Hapus background foto dan kirim sebagai PNG transparan.",
  usage: "(kirim bersama gambar atau reply gambar)",
};

const COMMAND_NAMES = new Set([meta.name, ...(meta.aliases ?? [])]);

function detectMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length > 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4));
    const webp = String.fromCharCode(...bytes.subarray(8, 12));
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  return null;
}

// Model dimuat sekali lalu dipakai ulang.
let modelPromise: Promise<[any, any]> | null = null;
function loadModel() {
  modelPromise ??= Promise.all([
    AutoModel.from_pretrained("Xenova/modnet", { dtype: "fp32" }),
    AutoProcessor.from_pretrained("Xenova/modnet"),
  ]);
  return modelPromise;
}

const MAX_SIDE = 2048;

async function removeBg(input: Uint8Array): Promise<Buffer> {
  const [model, processor] = await loadModel();

  const normalized = await sharp(input)
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const image = await RawImage.fromBlob(
    new Blob([normalized], { type: "image/png" }),
  );
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });

  const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(
    image.width,
    image.height,
  );

  const { data: rgb, info } = await sharp(normalized)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const alpha = mask.data[i] ?? 0;
    if (alpha === 0) continue;
    rgba[i * 4] = rgb[i * 3] ?? 0;
    rgba[i * 4 + 1] = rgb[i * 3 + 1] ?? 0;
    rgba[i * 4 + 2] = rgb[i * 3 + 2] ?? 0;
    rgba[i * 4 + 3] = alpha;
  }

  return sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function pickSource(message: ParsedMessage) {
  if (message.hasMedia && SUPPORTED_TYPES.has(message.type)) return "message";
  if (
    message.quoted?.hasMedia &&
    SUPPORTED_TYPES.has(message.quoted.type ?? "")
  ) {
    return "quote";
  }
  return null;
}

async function handleRemoveBackground(message: ParsedMessage) {
  const prefix = getCommandPrefixes()[0] ?? ".";
  const source = pickSource(message);
  if (!source) {
    await message.reply(
      `Kirim ${prefix}${meta.name} bersama gambar atau reply gambar dengan ${prefix}${meta.name}.`,
    );
    return;
  }

  const downloaded =
    source === "message"
      ? await message.downloadMediaMsg()
      : await message.downloadMediaFromQuote();
  if (!downloaded) {
    await message.reply(
      "Gambar tidak dapat diunduh. Coba kirim ulang fotonya.",
    );
    return;
  }

  const input = new Uint8Array(downloaded);
  if (input.byteLength > MAX_INPUT_SIZE) {
    await message.reply("Ukuran gambar terlalu besar. Maksimal 20 MB.");
    return;
  }

  const mime = detectMime(input);
  if (!mime) {
    await message.reply(
      "Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.",
    );
    return;
  }

  await message.reply("Sedang memproses gambar...");

  const output = await enqueue(() => removeBg(input));

  await message.reply({
    document: output,
    mimetype: "image/png",
    fileName: "bgremover.png",
  });
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (!command || !COMMAND_NAMES.has(command.name)) return;

  try {
    await handleRemoveBackground(message);
  } catch (error) {
    console.error("Gagal menghapus background:", error);
    const detail = error instanceof Error ? error.message : String(error);
    await message.reply(`Gagal menghapus background: ${detail}`);
  }
};
