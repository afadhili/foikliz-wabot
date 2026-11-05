import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket } from "@whiskeysockets/baileys";
import type { ParsedMessage } from "../src/parser";

const directory = await mkdtemp(join(tmpdir(), "wabot-group-test-"));
process.env.GROUP_SETTINGS_PATH = join(directory, "settings.json");
const {
  getGroupSettings,
  updateGroupSettings,
  moderateMessage,
  handleParticipantsUpdate,
} = await import("../src/group-moderation");
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

const group = "120363111111111111@g.us";
const member = "628333333333@s.whatsapp.net";
const bot = "628222222222@s.whatsapp.net";

function setup(text: string, type = "conversation", admin = false) {
  const deleted: string[] = [];
  const sent: Array<{ jid: string; text: string }> = [];
  const message = {
    chatId: group,
    id: "test-id",
    isGroup: true,
    fromMe: false,
    sender: member,
    text,
    type,
    hasMedia: type !== "conversation",
    isAdmin: async (jid = member) => jid === bot || (jid === member && admin),
    delete: async () => {
      deleted.push("deleted");
    },
  } as unknown as ParsedMessage;
  const socket = {
    user: { id: bot },
    groupMetadata: async () => ({ subject: "Grup Uji" }),
    sendMessage: async (jid: string, content: { text: string }) => {
      sent.push({ jid, text: content.text });
    },
  } as unknown as WASocket;
  return { message, socket, deleted, sent };
}

describe("moderasi per grup", () => {
  test("pengaturan tersimpan di JSON dan hanya berlaku untuk grup yang dipilih", async () => {
    await updateGroupSettings(group, (config) => {
      config.antisticker = true;
    });
    expect((await getGroupSettings(group)).antisticker).toBe(true);
    expect((await getGroupSettings("grup-lain@g.us")).antisticker).toBe(false);
    const saved = JSON.parse(
      await readFile(process.env.GROUP_SETTINGS_PATH!, "utf8"),
    );
    expect(saved[group].antisticker).toBe(true);
  });

  test("antisticker menghapus pesan anggota biasa, tidak menghapus pesan admin", async () => {
    const memberEnv = setup("", "stickerMessage");
    expect(await moderateMessage(memberEnv.socket, memberEnv.message)).toBe(
      true,
    );
    expect(memberEnv.deleted).toEqual(["deleted"]);
    const adminEnv = setup("", "stickerMessage", true);
    expect(await moderateMessage(adminEnv.socket, adminEnv.message)).toBe(
      false,
    );
    expect(adminEnv.deleted).toEqual([]);
  });

  test("antilink hanya memblokir domain yang diatur", async () => {
    await updateGroupSettings(group, (config) => {
      config.antilink = { enabled: true, domains: ["example.com"] };
    });
    const other = setup("https://other.com/path/example.com");
    expect(await moderateMessage(other.socket, other.message)).toBe(false);
    const blocked = setup("https://sub.example.com/video");
    expect(await moderateMessage(blocked.socket, blocked.message)).toBe(true);
    expect(blocked.deleted).toHaveLength(1);
  });

  test("antibadword hanya cocok kata utuh dan antispam menghapus setelah ambang", async () => {
    await updateGroupSettings(group, (config) => {
      config.antibadword = { enabled: true, words: ["kasar"] };
      config.antispam = true;
    });
    const safe = setup("tidak kasarnya kata ini");
    expect(await moderateMessage(safe.socket, safe.message)).toBe(false);
    const bad = setup("Kasar sekali");
    expect(await moderateMessage(bad.socket, bad.message)).toBe(true);
    const spam = setup("pesan lain");
    for (let index = 0; index < 5; index++) {
      expect(await moderateMessage(spam.socket, spam.message)).toBe(false);
    }
    expect(await moderateMessage(spam.socket, spam.message)).toBe(true);
  });

  test("welcome mengirim pesan dengan placeholder user dan nama grup", async () => {
    await updateGroupSettings(group, (config) => {
      config.welcome = { enabled: true, template: "Halo {user} di {group}!" };
    });
    const env = setup("");
    await handleParticipantsUpdate(env.socket, {
      id: group,
      participants: [member],
      action: "add",
    });
    expect(env.sent).toEqual([
      { jid: group, text: "Halo @628333333333 di Grup Uji!" },
    ]);
  });
});
