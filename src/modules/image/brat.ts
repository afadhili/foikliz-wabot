import sharp from "sharp";

import type { MessageModule, ModuleMeta } from "../index";

export const meta: ModuleMeta = {
  name: "brat",
  active: true,
  aliases: ["bratgreen"],
  description:
    "Buat sticker bergaya brat dari teks atau reply pesan teks. Latar putih dengan .brat, latar hijau dengan .bratgreen.",
  usage: "teks",
};

const SIZE = 512;
const PADDING = 28;
const INNER = SIZE - PADDING * 2;
const MAX_TEXT_LENGTH = 200;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 600;
const FONT_FAMILY = "Arial, Liberation Sans, DejaVu Sans, sans";
const BACKGROUNDS = {
  green: { r: 138, g: 206, b: 0 },
  white: { r: 255, g: 255, b: 255 },
};

type BratBackground = keyof typeof BACKGROUNDS;

interface TextLayer {
  buffer: Buffer;
  width: number;
  height: number;
}

const escapeMarkup = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function renderText(
  text: string,
  fontSize: number,
): Promise<TextLayer | null> {
  try {
    const buffer = await sharp({
      text: {
        text: `<span foreground="black">${escapeMarkup(text)}</span>`,
        font: `${FONT_FAMILY} ${fontSize}`,
        width: INNER,
        rgba: true,
        align: "left",
        wrap: "word-char",
        dpi: 72,
      },
    })
      .png()
      .toBuffer();
    const { width, height } = await sharp(buffer).metadata();
    return { buffer, width, height };
  } catch {
    return null;
  }
}

async function fitText(text: string): Promise<TextLayer> {
  let low = MIN_FONT_SIZE;
  let high = MAX_FONT_SIZE;
  let best = await renderText(text, low);
  if (!best) throw new Error("Teks tidak dapat dirender.");

  while (high - low > 2) {
    const mid = Math.floor((low + high) / 2);
    const candidate = await renderText(text, mid);
    if (candidate && candidate.height <= INNER) {
      best = candidate;
      low = mid;
    } else {
      high = mid;
    }
  }
  return best;
}

export async function createBratSticker(
  text: string,
  background: BratBackground = "white",
): Promise<Buffer> {
  const layer = await fitText(text.toLowerCase());
  // Lebar hasil render bisa melebihi area 1-2 px; skala turun bila perlu.
  const buffer =
    layer.width > INNER || layer.height > INNER
      ? await sharp(layer.buffer)
          .resize(INNER, INNER, { fit: "inside" })
          .png()
          .toBuffer()
      : layer.buffer;

  const blurred = await sharp(buffer).blur(1.2).png().toBuffer();
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: BACKGROUNDS[background],
    },
  })
    .composite([{ input: blurred, left: PADDING, top: PADDING }])
    .webp({ quality: 85 })
    .toBuffer();
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  const name = command?.name;
  if (!command || (name !== "brat" && name !== "bratgreen")) {
    return;
  }
  const background: BratBackground = name === "brat" ? "white" : "green";

  // Ambil dari teks asli agar baris baru tetap dipertahankan.
  const inline = message.text
    .trim()
    .slice(command.prefix.length)
    .replace(/^\S+\s*/, "");
  const text = (inline || message.quoted?.text || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();

  if (!text) {
    await message.reply(
      `Format: ${command.prefix}${name} ${meta.usage}\nAtau reply pesan teks dengan ${command.prefix}${name}.`,
    );
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    await message.reply(
      `Teks terlalu panjang (maksimal ${MAX_TEXT_LENGTH} karakter).`,
    );
    return;
  }

  await message.react("⏳");
  try {
    const sticker = await createBratSticker(text, background);
    await message.reply({ sticker });
    await message.react("👌");
  } catch (error) {
    console.error("Gagal membuat sticker brat:", error);
    await message.reply("Gagal membuat sticker brat.");
    await message.react("❌");
  }
};
