import { describe, expect, test } from "bun:test";
import type { GroupMetadata, WASocket } from "@whiskeysockets/baileys";
import type { ParsedMessage } from "../src/parser";
import { onMessage as kick } from "../src/modules/group/kick";
import { onMessage as add } from "../src/modules/group/add";
import { onMessage as grouplink } from "../src/modules/group/grouplink";

const group = "120363000000000000@g.us";
const sender = "628111111111@s.whatsapp.net";
const bot = "628222222222@s.whatsapp.net";
const target = "628333333333@s.whatsapp.net";

function setup(command: string, admin = true) {
  const replies: string[] = [];
  const actions: string[] = [];
  const metadata = {
    id: group,
    participants: [
      { id: sender, admin: admin ? "admin" : null },
      { id: bot, admin: "admin" },
      { id: target, admin: null },
    ],
  } as GroupMetadata;
  const message = {
    chatId: group,
    sender,
    isGroup: true,
    mentions: command.includes("@anggota") ? [target] : [],
    command: () => ({
      name: command.split(" ")[0]!.slice(1),
      prefix: ".",
      rest: command.split(" ").slice(1).join(" "),
      args: command.split(" ").slice(1),
    }),
    getGroupMetadata: async () => metadata,
    reply: async (text: string) => {
      replies.push(text);
    },
  } as unknown as ParsedMessage;
  const socket = {
    user: { id: bot },
    signalRepository: {
      lidMapping: {
        getLIDForPN: async () => undefined,
        getPNForLID: async () => undefined,
      },
    },
    groupParticipantsUpdate: async (
      _group: string,
      jids: string[],
      action: string,
    ) => {
      actions.push(`${action}:${jids[0]}`);
      return [{ jid: jids[0], status: "200" }];
    },
    groupInviteCode: async () => "testcode",
  } as unknown as WASocket;
  return { message, socket, replies, actions };
}

describe("perintah grup", () => {
  test("non-admin tidak bisa kick", async () => {
    const env = setup(".kick @anggota", false);
    await kick({ ...env, modules: [] });
    expect(env.actions).toEqual([]);
    expect(env.replies[0]).toContain("admin grup");
  });

  test("bot tanpa hak admin tidak menjalankan tindakan", async () => {
    const env = setup(".kick @anggota");
    const metadata = await env.message.getGroupMetadata();
    metadata!.participants[1]!.admin = null;
    await kick({ ...env, modules: [] });
    expect(env.actions).toEqual([]);
    expect(env.replies[0]).toContain("Bot harus menjadi admin");
  });

  test("admin bisa kick anggota biasa, bukan admin lain", async () => {
    const env = setup(".kick @anggota");
    await kick({ ...env, modules: [] });
    expect(env.actions).toEqual([`remove:${target}`]);
    expect(env.replies[0]).toContain("berhasil");
    env.actions.length = 0;
    (env.message.mentions as string[])[0] = bot;
    await kick({ ...env, modules: [] });
    expect(env.actions).toEqual([]);
  });

  test("add menolak target yang sudah anggota", async () => {
    const env = setup(`.add ${target.split("@")[0]}`);
    await add({ ...env, modules: [] });
    expect(env.actions).toEqual([]);
    expect(env.replies[0]).toContain("sudah menjadi anggota");
  });

  test("grouplink hanya untuk admin", async () => {
    const env = setup(".grouplink", false);
    await grouplink({ ...env, modules: [] });
    expect(env.replies[0]).toContain("admin grup");
    const admin = setup(".grouplink");
    await grouplink({ ...admin, modules: [] });
    expect(admin.replies[0]).toBe("https://chat.whatsapp.com/testcode");
  });
});
