import {
  jidNormalizedUser,
  type GroupMetadata,
  type GroupParticipant,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { ModuleContext } from "../index";
import type { ParsedMessage } from "../../parser";

type Identity = Set<string>;
export type GroupAccess = {
  message: ParsedMessage;
  socket: WASocket;
  metadata: GroupMetadata;
  sender: Identity;
  bot: Identity;
};

const JID = /^\d+@(s\.whatsapp\.net|lid)$/;
const PHONE = /^\+?\d{6,15}$/;

function validJid(value: string | undefined): string | null {
  if (!value || !/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(value))
    return null;
  const normalized = jidNormalizedUser(value);
  return JID.test(normalized) ? normalized : null;
}

async function identity(
  socket: WASocket,
  ...values: (string | undefined)[]
): Promise<Identity> {
  const ids: Identity = new Set();
  for (const value of values) {
    const jid = validJid(value);
    if (!jid) continue;
    ids.add(jid);
    try {
      const mapped = jid.endsWith("@lid")
        ? await socket.signalRepository.lidMapping.getPNForLID(jid)
        : await socket.signalRepository.lidMapping.getLIDForPN(jid);
      const other = validJid(mapped ?? undefined);
      if (other) ids.add(other);
    } catch {
      // Missing mapping is not evidence that two different identities match.
    }
  }
  return ids;
}

function overlaps(a: Identity, b: Identity): boolean {
  return [...a].some((jid) => b.has(jid));
}

async function participantIdentity(
  socket: WASocket,
  p: GroupParticipant,
): Promise<Identity> {
  return identity(socket, p.id, p.lid, p.phoneNumber);
}

export async function withGroupAccess(
  context: ModuleContext,
  action: (access: GroupAccess) => Promise<void>,
): Promise<void> {
  const { message } = context;
  if (!message.isGroup) {
    await message.reply("Command ini hanya dapat dipakai di grup.");
    return;
  }
  try {
    const socket = context.socket as WASocket;
    const metadata = await message.getGroupMetadata();
    if (!metadata) {
      await message.reply("Gagal mengambil data grup.");
      return;
    }
    const sender = await identity(socket, message.sender);
    const bot = await identity(socket, socket.user?.id, socket.user?.lid);
    if (!sender.size || !bot.size) {
      await message.reply("Tidak dapat memverifikasi identitas admin.");
      return;
    }
    let senderAdmin = false;
    let botAdmin = false;
    for (const participant of metadata.participants) {
      if (
        !participant.admin &&
        !participant.isAdmin &&
        !participant.isSuperAdmin
      )
        continue;
      const ids = await participantIdentity(socket, participant);
      if (overlaps(sender, ids)) senderAdmin = true;
      if (overlaps(bot, ids)) botAdmin = true;
    }
    if (!senderAdmin) {
      await message.reply("Command ini hanya untuk admin grup.");
      return;
    }
    if (!botAdmin) {
      await message.reply("Bot harus menjadi admin grup.");
      return;
    }
    await action({ message, socket, metadata, sender, bot });
  } catch (error) {
    console.error("Gagal mengelola grup:", error);
    await message.reply("Gagal mengelola grup. Coba lagi nanti.");
  }
}

export async function resolveTarget(
  access: GroupAccess,
  rest: string,
  allowAbsent: boolean,
  usage: string,
  explicitPhoneOnly = false,
): Promise<{
  jid: string;
  participant?: GroupParticipant;
  ids: Identity;
} | null> {
  const { message, socket, metadata } = access;
  if (!explicitPhoneOnly && message.mentions.length > 1) {
    await message.reply("Pilih satu target saja.");
    return null;
  }
  const source =
    explicitPhoneOnly || PHONE.test(rest.trim())
      ? rest.trim()
      : (message.mentions[0] ?? message.quoted?.sender ?? rest.trim());
  const jid = PHONE.test(source)
    ? `${source.replace(/^\+/, "")}@s.whatsapp.net`
    : validJid(source);
  if (!jid) {
    await message.reply(`Target tidak valid. Format: ${usage}`);
    return null;
  }
  const ids = await identity(socket, jid);
  const matches: GroupParticipant[] = [];
  for (const participant of metadata.participants) {
    if (overlaps(ids, await participantIdentity(socket, participant)))
      matches.push(participant);
  }
  if (matches.length > 1) {
    await message.reply("Identitas target ambigu; tindakan dibatalkan.");
    return null;
  }
  const participant = matches[0];
  if (participant) {
    for (const alias of await participantIdentity(socket, participant))
      ids.add(alias);
  }
  if (!participant && !allowAbsent) {
    await message.reply("Target bukan anggota grup.");
    return null;
  }
  return { jid: participant?.id ?? jid, participant, ids };
}

export function hasAdminRole(participant: GroupParticipant): boolean {
  return !!(
    participant.admin ||
    participant.isAdmin ||
    participant.isSuperAdmin
  );
}

export async function isProtected(
  access: GroupAccess,
  ids: Identity,
): Promise<boolean> {
  const owner = await identity(
    access.socket,
    access.metadata.owner,
    access.metadata.ownerPn,
  );
  return overlaps(ids, access.bot) || overlaps(ids, owner);
}

export function isSameIdentity(left: Identity, right: Identity): boolean {
  return overlaps(left, right);
}

export async function updateParticipant(
  access: GroupAccess,
  jid: string,
  action: "add" | "remove" | "promote" | "demote",
  success: string,
): Promise<void> {
  const results = await access.socket.groupParticipantsUpdate(
    access.message.chatId,
    [jid],
    action,
  );
  const target = await identity(access.socket, jid);
  let result;
  for (const item of results) {
    if (item.jid && overlaps(target, await identity(access.socket, item.jid))) {
      result = item;
      break;
    }
  }
  if (result?.status === "200") {
    await access.message.reply(success);
  } else {
    await access.message.reply(
      `Gagal ${action} target (status: ${result?.status ?? "tidak diketahui"}).`,
    );
  }
}
