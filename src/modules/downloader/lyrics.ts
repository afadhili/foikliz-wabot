import type { MessageModule, ModuleMeta } from "../index";
import { cachedApi, monitorApiCall } from "../../analytics/runtime";

const MAX_MESSAGE_LENGTH = 3_300;
const MAX_LYRICS_LENGTH = 24_000;
const REQUEST_TIMEOUT_MS = 10_000;

export const meta: ModuleMeta = {
  name: "lyrics",
  active: true,
  aliases: ["lirik"],
  description: "Cari lirik lagu melalui LRCLIB dan NetEase.",
  usage: "judul lagu - nama artis",
};

interface LrclibResult {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

interface NeteaseSearchResult {
  result?: {
    songs?: Array<{
      id: number;
      name: string;
      artists?: Array<{ name: string }>;
      album?: { name: string };
    }>;
  };
}

interface NeteaseLyricResult {
  lrc?: { lyric?: string };
  tlyric?: { lyric?: string };
}

interface LyricsResult {
  title: string;
  artist: string;
  album?: string;
  lyrics: string;
  source: string;
}

async function fetchJson<T>(url: URL): Promise<T> {
  return cachedApi(url.toString(), 6 * 60 * 60_000, () =>
    monitorApiCall(
      url.hostname === "lrclib.net" ? "lrclib" : "netease",
      async () => {
        const response = await fetch(url, {
          headers: { "User-Agent": "FoiklizWabot/1.0 (lyrics lookup)" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`Penyedia lirik merespons HTTP ${response.status}.`);
        }
        return (await response.json()) as T;
      },
    ),
  );
}

async function searchLrclib(query: string): Promise<LyricsResult | null> {
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("q", query);
  const results = await fetchJson<LrclibResult[]>(url);
  const result = results.find(
    (item) => item.plainLyrics?.trim() || item.syncedLyrics?.trim(),
  );
  if (!result) return null;

  return {
    title: result.trackName ?? "Judul tidak diketahui",
    artist: result.artistName ?? "Artis tidak diketahui",
    album: result.albumName,
    lyrics: result.plainLyrics?.trim() || result.syncedLyrics!.trim(),
    source: "LRCLIB",
  };
}

async function searchNetease(query: string): Promise<LyricsResult | null> {
  const searchUrl = new URL("https://music.163.com/api/search/get");
  searchUrl.searchParams.set("s", query);
  searchUrl.searchParams.set("type", "1");
  searchUrl.searchParams.set("limit", "5");
  const search = await fetchJson<NeteaseSearchResult>(searchUrl);
  const song = search.result?.songs?.[0];
  if (!song) return null;

  const lyricUrl = new URL("https://music.163.com/api/song/lyric");
  lyricUrl.searchParams.set("id", String(song.id));
  lyricUrl.searchParams.set("lv", "1");
  lyricUrl.searchParams.set("kv", "1");
  lyricUrl.searchParams.set("tv", "-1");
  const result = await fetchJson<NeteaseLyricResult>(lyricUrl);
  const lyrics = result.lrc?.lyric?.trim() || result.tlyric?.lyric?.trim();
  if (!lyrics) return null;

  return {
    title: song.name,
    artist:
      song.artists?.map((artist) => artist.name).join(", ") ||
      "Artis tidak diketahui",
    album: song.album?.name,
    lyrics,
    source: "NetEase Music",
  };
}

async function findLyrics(query: string): Promise<LyricsResult | null> {
  const errors: string[] = [];
  for (const provider of [searchLrclib, searchNetease]) {
    try {
      const result = await provider(query);
      if (result) return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length === 2) {
    throw new Error(`Semua penyedia lirik gagal: ${errors.join("; ")}`);
  }
  return null;
}

function splitLyrics(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim().slice(0, MAX_LYRICS_LENGTH);
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    let splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = remaining.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH / 2) splitAt = MAX_MESSAGE_LENGTH;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export const onMessage: MessageModule = async ({ message }) => {
  const command = message.command();
  if (command?.name !== "lyrics" && command?.name !== "lirik") return;
  const [title, artist] = command.rest
    .split(/\s+-\s+/, 2)
    .map((part) => part.trim());
  if (!title || !artist) {
    await message.reply(`Format: ${command.prefix}lyrics ${meta.usage}`);
    return;
  }
  const query = `${title} ${artist}`;

  await message.react("🔎");
  try {
    const result = await findLyrics(query);
    if (!result) {
      await message.reply(
        `Lirik untuk "${title} - ${artist}" tidak ditemukan.`,
      );
      await message.react("❌");
      return;
    }

    const header = [
      `*${result.title}* — ${result.artist}`,
      ...(result.album ? [`Album: ${result.album}`] : []),
      `Sumber: ${result.source}`,
      "",
    ].join("\n");
    const chunks = splitLyrics(result.lyrics);
    for (let index = 0; index < chunks.length; index++) {
      const heading =
        chunks.length > 1
          ? `${header}(bagian ${index + 1}/${chunks.length})\n`
          : header;
      await message.reply(`${heading}\n\n${chunks[index]}`);
    }
    if (result.lyrics.length > MAX_LYRICS_LENGTH) {
      await message.reply("Lirik terlalu panjang, hasil dipotong.");
    }
    await message.react("✅");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await message.reply(`Gagal mencari lirik: ${detail}`);
    await message.react("❌");
  }
};
