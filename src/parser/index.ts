import { join } from "node:path";
import {
  downloadMediaMessage,
  extractMessageContent,
  getContentType,
  jidNormalizedUser,
  proto,
  type AnyMessageContent,
  type GroupMetadata,
  type MiscMessageGenerationOptions,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import sharp from "sharp";

const MEDIA_TYPES = [
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
];

export interface ParsedCommand {
  name: string;
  args: string[];
  prefix: string;
  rest: string;
}

export function getCommandPrefixes(): string[] {
  const configured = process.env.COMMAND_PREFIXES?.split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);
  return configured?.length ? [...new Set(configured)] : ["."];
}

export interface BannerOptions {
  title?: string;
  body?: string;
  sourceUrl?: string;
  imagePath?: string;
}

const BANNER_DEFAULTS = {
  title: () => process.env.BOT_NAME ?? "Relayz Bot",
  body: () => process.env.BOT_TAGLINE ?? "afadhili",
  sourceUrl: () => process.env.BOT_URL ?? "https://github.com/afadhili",
  imagePath: () =>
    process.env.BANNER_PATH ?? join(process.cwd(), "assets", "banner.png"),
};

const thumbnailCache = new Map<string, Promise<Buffer | null>>();

function loadThumbnail(path: string): Promise<Buffer | null> {
  let cached = thumbnailCache.get(path);
  if (!cached) {
    cached = (async () => {
      try {
        const file = Bun.file(path);
        if (!(await file.exists())) return null;
        const buffer = await sharp(await file.arrayBuffer())
          .resize(600, 315, { fit: "cover" })
          .jpeg({ quality: 60, mozjpeg: true })
          .toBuffer();
        console.log(`Thumbnail banner: ${Math.round(buffer.length / 1024)} KB`);
        return buffer;
      } catch (error) {
        console.error("Gagal memuat banner:", error);
        return null;
      }
    })();
    thumbnailCache.set(path, cached);
  }
  return cached;
}

const BANNER_MODE = process.env.BANNER_MODE ?? "full";

async function bannerContent(
  text: string,
  banner: BannerOptions = {},
): Promise<AnyMessageContent> {
  const thumbnail =
    BANNER_MODE === "nothumb"
      ? null
      : await loadThumbnail(banner.imagePath ?? BANNER_DEFAULTS.imagePath());

  return {
    text,
    contextInfo: {
      externalAdReply: {
        title: banner.title ?? BANNER_DEFAULTS.title(),
        body: banner.body ?? BANNER_DEFAULTS.body(),
        sourceUrl: banner.sourceUrl ?? BANNER_DEFAULTS.sourceUrl(),
        mediaType: 1,
        renderLargerThumbnail: BANNER_MODE !== "small",
        showAdAttribution: false,
        ...(thumbnail ? { thumbnail } : {}),
      },
    },
  };
}

export interface QuotedMessage {
  id?: string;
  sender?: string;
  type?: string;
  text: string;
  hasMedia: boolean;
  mimetype?: string;
  raw: WAMessage;
}

export interface ParsedMessage {
  id: string;
  chatId: string;
  isGroup: boolean;
  fromMe: boolean;
  sender: string;
  pushName: string;
  timestamp: number;
  type: string;
  text: string;
  mentions: string[];
  hasMedia: boolean;
  mimetype?: string;
  quoted?: QuotedMessage;
  raw: WAMessage;

  reply(
    content: string | AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined>;
  send(
    content: string | AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined>;
  /** Balas (quote) dengan teks dan banner sebagai kartu link preview. */
  replyWithBanner(
    text: string,
    banner?: BannerOptions,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined>;
  /** Kirim (tanpa quote) teks dan banner sebagai kartu link preview. */
  sendWithBanner(
    text: string,
    banner?: BannerOptions,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined>;
  mention(text: string, jids?: string[]): Promise<WAMessage | undefined>;
  react(emoji: string): Promise<WAMessage | undefined>;
  delete(): Promise<WAMessage | undefined>;
  read(): Promise<void>;
  /** Tampilkan "sedang mengetik..." selama `ms` milidetik. */
  typing(ms?: number): Promise<void>;

  /** Unduh media dari pesan ini. null jika tidak ada media. */
  downloadMediaMsg(): Promise<Buffer | null>;
  /** Unduh media dari pesan yang di-reply. null jika tidak ada. */
  downloadMediaFromQuote(): Promise<Buffer | null>;
  /** Unduh dari pesan sendiri, fallback ke quote. */
  downloadAnyMedia(): Promise<Buffer | null>;

  getGroupMetadata(): Promise<GroupMetadata | null>;
  isAdmin(jid?: string): Promise<boolean>;
  /** Parse command menggunakan prefix dari COMMAND_PREFIXES atau prefix override. */
  command(prefix?: string | string[]): ParsedCommand | null;
}

function getText(content: proto.IMessage | undefined, type?: string): string {
  if (!content || !type) return "";
  const message = content as any;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message[type]?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toContent = (content: string | AnyMessageContent): AnyMessageContent =>
  typeof content === "string" ? { text: content } : content;

export function parsedMessage(
  sock: WASocket,
  msg: WAMessage,
): ParsedMessage | null {
  if (!msg.message || !msg.key.remoteJid) return null;

  const content = extractMessageContent(msg.message);
  const type = getContentType(content);
  if (!content || !type) return null;

  const chatId = msg.key.remoteJid;
  const isGroup = chatId.endsWith("@g.us");
  const rawSender = isGroup ? msg.key.participant : chatId;
  const context = (content as any)[type]?.contextInfo as
    proto.IContextInfo | undefined;
  const quotedContent = context?.quotedMessage
    ? extractMessageContent(context.quotedMessage)
    : undefined;
  const quotedType = getContentType(quotedContent);
  const media = (content as any)[type];

  const sender = rawSender ? jidNormalizedUser(rawSender) : "";
  const hasMedia = MEDIA_TYPES.includes(type);

  const quoted: QuotedMessage | undefined = context?.quotedMessage
    ? {
        id: context.stanzaId ?? undefined,
        sender: context.participant
          ? jidNormalizedUser(context.participant)
          : undefined,
        type: quotedType ?? undefined,
        text: getText(quotedContent, quotedType),
        hasMedia: !!quotedType && MEDIA_TYPES.includes(quotedType),
        mimetype: quotedType
          ? (quotedContent as any)?.[quotedType]?.mimetype
          : undefined,
        raw: {
          key: {
            remoteJid: chatId,
            id: context.stanzaId,
            fromMe: false,
            participant: context.participant ?? undefined,
          },
          message: context.quotedMessage,
        } as WAMessage,
      }
    : undefined;

  const download = async (target: WAMessage): Promise<Buffer | null> => {
    try {
      return (await downloadMediaMessage(
        target,
        "buffer",
        {},
        { logger: sock.logger, reuploadRequest: sock.updateMediaMessage },
      )) as Buffer;
    } catch (error) {
      console.error("Gagal download media:", error);
      return null;
    }
  };

  let groupMeta: Promise<GroupMetadata | null> | undefined;

  const parsed: ParsedMessage = {
    id: msg.key.id ?? "",
    chatId,
    isGroup,
    fromMe: !!msg.key.fromMe,
    sender,
    pushName: msg.pushName ?? "",
    timestamp: Number(msg.messageTimestamp ?? 0),
    type,
    text: getText(content, type),
    mentions: context?.mentionedJid ?? [],
    hasMedia,
    mimetype: media?.mimetype,
    quoted,
    raw: msg,

    reply: (reply, options) =>
      sock.sendMessage(chatId, toContent(reply), { quoted: msg, ...options }),

    send: (message, options) =>
      sock.sendMessage(chatId, toContent(message), options),

    replyWithBanner: async (text, banner, options) =>
      sock.sendMessage(chatId, await bannerContent(text, banner), {
        quoted: msg,
        ...options,
      }),

    sendWithBanner: async (text, banner, options) =>
      sock.sendMessage(chatId, await bannerContent(text, banner), options),

    mention: (text, jids = [sender]) =>
      sock.sendMessage(chatId, { text, mentions: jids }),

    react: (emoji) =>
      sock.sendMessage(chatId, { react: { text: emoji, key: msg.key } }),

    delete: () => sock.sendMessage(chatId, { delete: msg.key }),

    read: () => sock.readMessages([msg.key]),

    typing: async (ms = 1000) => {
      await sock.sendPresenceUpdate("composing", chatId);
      await sleep(ms);
      await sock.sendPresenceUpdate("paused", chatId);
    },

    downloadMediaMsg: async () => (hasMedia ? download(msg) : null),

    downloadMediaFromQuote: async () =>
      quoted?.hasMedia ? download(quoted.raw) : null,

    downloadAnyMedia: async () =>
      (await parsed.downloadMediaMsg()) ??
      (await parsed.downloadMediaFromQuote()),

    getGroupMetadata: () => {
      if (!isGroup) return Promise.resolve(null);
      groupMeta ??= sock.groupMetadata(chatId).catch(() => null);
      return groupMeta;
    },

    isAdmin: async (jid = sender) => {
      const meta = await parsed.getGroupMetadata();
      if (!meta) return false;
      const target = jidNormalizedUser(jid);
      return meta.participants.some(
        (p: any) =>
          (jidNormalizedUser(p.id) === target || p.phoneNumber === target) &&
          !!p.admin,
      );
    },

    command: (prefix) => {
      const text = parsed.text.trim();
      const prefixes = (
        prefix
          ? Array.isArray(prefix)
            ? prefix
            : [prefix]
          : getCommandPrefixes()
      )
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
      const matchedPrefix = prefixes.find((candidate) =>
        text.startsWith(candidate),
      );
      if (!matchedPrefix) return null;

      const [name = "", ...args] = text
        .slice(matchedPrefix.length)
        .trim()
        .split(/\s+/);
      if (!name) return null;
      return {
        name: name.toLowerCase(),
        args,
        prefix: matchedPrefix,
        rest: args.join(" "),
      };
    },
  };

  return parsed;
}
