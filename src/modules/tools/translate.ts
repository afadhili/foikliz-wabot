import type { MessageModule, ModuleMeta } from "../index";
import { monitorApiCall } from "../../analytics/runtime";

export const meta: ModuleMeta = {
  name: "translate",
  active: true,
  aliases: ["tr"],
  description:
    "Terjemahkan teks (bahasa sumber terdeteksi otomatis, default ke Indonesia). Bisa juga dengan reply pesan.",
  usage: "[kode bahasa tujuan] teks",
};

const MAX_LENGTH = 450;
const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z]{2})?$/i;

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  responseDetails?: string;
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "translate" && command?.name !== "tr") return;

  const [first, ...others] = command.args;
  const quotedText = message.quoted?.text.trim();
  let target = "id";
  let text = command.rest;
  if (first && LANGUAGE_CODE.test(first) && (others.length > 0 || quotedText)) {
    target = first.toLowerCase();
    text = others.join(" ");
  }
  text = text.trim() || quotedText || "";

  if (!text) {
    await message.reply(
      `Format: ${command.prefix}translate ${meta.usage}\nContoh: ${command.prefix}translate en selamat pagi`,
    );
    return;
  }
  if (text.length > MAX_LENGTH) {
    await message.reply(
      `Teks terlalu panjang (maksimal ${MAX_LENGTH} karakter).`,
    );
    return;
  }

  await message.react("⏳");
  try {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `Autodetect|${target}`);
    const translated = await monitorApiCall("mymemory", async () => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(
          `Layanan terjemahan merespons HTTP ${response.status}.`,
        );
      }
      const data = (await response.json()) as MyMemoryResponse;
      const translatedText = data.responseData?.translatedText?.trim();
      if (Number(data.responseStatus) !== 200 || !translatedText) {
        throw new Error(data.responseDetails || "Terjemahan tidak tersedia.");
      }
      return translatedText;
    });

    await message.reply(`*Terjemahan (${target})*\n${translated}`);
    await message.react("✅");
  } catch (error) {
    await message.reply(
      `Gagal menerjemahkan: ${error instanceof Error ? error.message : String(error)}`,
    );
    await message.react("❌");
  }
};
