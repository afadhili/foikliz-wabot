import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { jidNormalizedUser, type WASocket } from "@whiskeysockets/baileys";
import type { ParsedMessage } from "../parser";

const settingsPath =
  process.env.GROUP_SETTINGS_PATH ||
  join(process.cwd(), "data", "group-settings.json");
const mediaTypes = ["image", "video", "audio", "document"] as const;
export type MediaType = (typeof mediaTypes)[number];

export interface GroupSettings {
  welcome: { enabled: boolean; template: string };
  goodbye: { enabled: boolean; template: string };
  antispam: boolean;
  antilink: { enabled: boolean; domains: string[] };
  antibadword: { enabled: boolean; words: string[] };
  antisticker: boolean;
  antimedia: { enabled: boolean; types: MediaType[] };
  mute: boolean;
}

const defaults = (): GroupSettings => ({
  welcome: { enabled: false, template: "Selamat datang {user} di {group}!" },
  goodbye: { enabled: false, template: "Selamat tinggal {user} dari {group}." },
  antispam: false,
  antilink: { enabled: false, domains: [] },
  antibadword: { enabled: false, words: [] },
  antisticker: false,
  antimedia: { enabled: false, types: [...mediaTypes] },
  mute: false,
});

// A single queue serializes read/modify/write transactions so concurrent commands cannot lose updates.
let settings: Promise<Record<string, GroupSettings>> | undefined;
let pending: Promise<void> = Promise.resolve();
let tempNumber = 0;

function loadSettings(): Promise<Record<string, GroupSettings>> {
  settings ??= readFile(settingsPath, "utf8").then(
    (text) => {
      const data: unknown = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Format group-settings.json tidak valid");
      }
      return data as Record<string, GroupSettings>;
    },
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return {};
      throw error;
    },
  );
  return settings;
}

function currentSettings(
  data: Record<string, GroupSettings>,
  groupId: string,
): GroupSettings {
  const saved = data[groupId];
  const base = defaults();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    welcome: { ...base.welcome, ...saved.welcome },
    goodbye: { ...base.goodbye, ...saved.goodbye },
    antilink: { ...base.antilink, ...saved.antilink },
    antibadword: { ...base.antibadword, ...saved.antibadword },
    antimedia: { ...base.antimedia, ...saved.antimedia },
  };
}

export async function getGroupSettings(
  groupId: string,
): Promise<GroupSettings> {
  await pending;
  return structuredClone(currentSettings(await loadSettings(), groupId));
}

export function updateGroupSettings(
  groupId: string,
  change: (value: GroupSettings) => void,
): Promise<GroupSettings> {
  const transaction = pending.then(async () => {
    const data = await loadSettings();
    const next = currentSettings(data, groupId);
    change(next);
    const updated = { ...data, [groupId]: next };
    await mkdir(dirname(settingsPath), { recursive: true });
    const temporary = `${settingsPath}.${process.pid}.${++tempNumber}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(updated, null, 2) + "\n", {
        flag: "wx",
      });
      await rename(temporary, settingsPath);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    settings = Promise.resolve(updated);
    return structuredClone(next);
  });
  pending = transaction.then(
    () => {},
    () => {},
  );
  return transaction;
}

export async function requireGroupAdmin(
  message: ParsedMessage,
): Promise<boolean> {
  if (!message.isGroup) {
    await message.reply("Command ini hanya dapat dipakai di grup.");
    return false;
  }
  if (!(await message.isAdmin())) {
    await message.reply("Command ini hanya untuk admin grup.");
    return false;
  }
  return true;
}

export function normalizeDomain(input: string): string | null {
  const domain = input.trim().toLowerCase().replace(/\.$/, "");
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)
    ? domain
    : null;
}

export function normalizeBadWord(input: string): string | null {
  const word = input.trim().toLowerCase();
  return /^[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*$/u.test(word) ? word : null;
}

function hasBlockedLink(text: string, domains: string[]): boolean {
  // URLs and bare domains are checked by hostname; domains in URL paths or emails are not links.
  const links =
    /(?:https?:\/\/|www\.)[^\s<>"']+|(?<![@\w.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"']*)?/gi;
  for (const match of text.matchAll(links)) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(match[0]) ? match[0] : `https://${match[0]}`,
      );
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      if (
        domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
      )
        return true;
    } catch {
      // Ignore malformed links.
    }
  }
  return false;
}

function hasBadWord(text: string, words: string[]): boolean {
  return words.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
      "iu",
    ).test(text);
  });
}

// Only track recent messages in groups where antispam is enabled. Eight messages
// within ten seconds is deliberately conservative to avoid punishing normal chat.
const recent = new Map<string, number[]>();
function isSpam(groupId: string, sender: string): boolean {
  const key = `${groupId}:${sender}`;
  const now = Date.now();
  const timestamps = (recent.get(key) ?? []).filter(
    (time) => now - time < 10_000,
  );
  timestamps.push(now);
  recent.set(key, timestamps);
  if (recent.size > 2000) {
    for (const [id, times] of recent) {
      if (times[times.length - 1]! < now - 10_000) recent.delete(id);
    }
  }
  return timestamps.length >= 8;
}

async function botIsAdmin(
  socket: WASocket,
  message: ParsedMessage,
): Promise<boolean> {
  const botIds = [socket.user?.id, socket.user?.lid].filter(
    (id): id is string => !!id,
  );
  for (const id of botIds) {
    if (await message.isAdmin(jidNormalizedUser(id))) return true;
  }
  return false;
}

/** Return true to stop command dispatch (also when deletion is unavailable). */
export async function moderateMessage(
  socket: WASocket,
  message: ParsedMessage,
): Promise<boolean> {
  if (!message.isGroup || message.fromMe || !message.sender) return false;
  const self = [socket.user?.id, socket.user?.lid]
    .filter((id): id is string => !!id)
    .map((id) => jidNormalizedUser(id));
  if (self.includes(jidNormalizedUser(message.sender))) return false;
  const config = await getGroupSettings(message.chatId);
  if (
    !config.mute &&
    !config.antispam &&
    !config.antilink.enabled &&
    !config.antibadword.enabled &&
    !config.antisticker &&
    !config.antimedia.enabled
  )
    return false;
  if (await message.isAdmin()) return false;
  if (config.mute) return true;

  let violation = false;
  if (config.antispam && (message.text || message.hasMedia)) {
    violation = isSpam(message.chatId, message.sender);
  }
  if (
    config.antilink.enabled &&
    config.antilink.domains.length &&
    message.text
  ) {
    violation ||= hasBlockedLink(message.text, config.antilink.domains);
  }
  if (
    config.antibadword.enabled &&
    config.antibadword.words.length &&
    message.text
  ) {
    violation ||= hasBadWord(message.text, config.antibadword.words);
  }
  if (config.antisticker && message.type === "stickerMessage") violation = true;
  const type = message.type.replace(/Message$/, "") as MediaType;
  if (config.antimedia.enabled && config.antimedia.types.includes(type))
    violation = true;
  if (!violation) return false;

  if (message.id && (await botIsAdmin(socket, message))) {
    try {
      await message.delete();
    } catch (error) {
      console.error(`Gagal menghapus pesan di ${message.chatId}:`, error);
    }
  }
  return true;
}

/** Accepts Baileys' runtime participant objects as well as string JIDs. */
export async function handleParticipantsUpdate(
  socket: WASocket,
  update: { id: string; participants: string[]; action: string },
): Promise<void> {
  const kind =
    update.action === "add"
      ? "welcome"
      : update.action === "remove"
        ? "goodbye"
        : null;
  if (!kind || !update.id.endsWith("@g.us")) return;
  const setting = (await getGroupSettings(update.id))[kind];
  if (!setting.enabled) return;

  const participants = update.participants
    .map((value) =>
      typeof value === "string" ? value : (value as { id?: string })?.id,
    )
    .filter((id): id is string => typeof id === "string" && !!id);
  if (!participants.length) return;
  const subject = await socket.groupMetadata(update.id).then(
    (metadata) => metadata.subject,
    () => update.id,
  );
  const self = [socket.user?.id, socket.user?.lid]
    .filter((id): id is string => !!id)
    .map((id) => jidNormalizedUser(id));
  for (const participant of participants) {
    const jid = jidNormalizedUser(participant);
    if (self.includes(jid)) continue;
    const text = setting.template
      .replaceAll("{user}", `@${jid.split("@")[0]}`)
      .replaceAll("{group}", subject);
    await socket.sendMessage(update.id, { text, mentions: [jid] });
  }
}
