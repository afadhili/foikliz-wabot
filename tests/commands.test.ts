import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WASocket, WAMessage } from "@whiskeysockets/baileys";

import {
  dispatchMessage,
  type LoadedMessageModule,
  type ModuleMeta,
} from "../src/modules";
import { onMessage as help } from "../src/modules/utils/help";
import { onMessage as stickerHandler } from "../src/modules/image/sticker";
import { parsedMessage, type ParsedMessage } from "../src/parser";
import { getAnalytics } from "../src/analytics/store";

const analyticsDirectory = await mkdtemp(
  join(tmpdir(), "wabot-commands-test-"),
);
process.env.ANALYTICS_DB_PATH = join(analyticsDirectory, "test.sqlite");
afterAll(async () => {
  getAnalytics().close();
  await rm(analyticsDirectory, { recursive: true, force: true });
});

function imageCommand(caption: string): ParsedMessage {
  const raw = {
    key: { remoteJid: "6281234567890@s.whatsapp.net", id: "test" },
    message: { imageMessage: { caption, mimetype: "image/jpeg" } },
  } as WAMessage;
  return parsedMessage({} as WASocket, raw)!;
}

const removeBg: ModuleMeta = {
  name: "bgremover",
  aliases: ["removebg", "rbg"],
  description: "Hapus latar gambar.",
  active: true,
  category: "image",
};
const sticker: ModuleMeta = {
  name: "sticker",
  aliases: ["s"],
  description: "Buat sticker.",
  active: true,
  category: "image",
};
const owner: ModuleMeta = {
  name: "status",
  description: "Status bot.",
  active: true,
  ownerOnly: true,
  category: "owner",
};

function modulesWithHelp(sent: string[]): LoadedMessageModule[] {
  return [
    { meta: removeBg, onMessage: () => sent.push("removebg") },
    { meta: sticker, onMessage: () => sent.push("sticker") },
    { meta: owner, onMessage: () => sent.push("status") },
    {
      meta: {
        name: "help",
        active: true,
        description: "Bantuan.",
        category: "utils",
      },
      onMessage: help,
    },
  ];
}

function mockMessage(text: string, replies: string[]): ParsedMessage {
  const message = imageCommand(text);
  message.reply = async (content) => {
    replies.push(
      typeof content === "string" ? content : JSON.stringify(content),
    );
    return undefined;
  };
  message.sendWithBanner = async (content) => {
    replies.push(content);
    return undefined;
  };
  return message;
}

describe("routing command dan help", () => {
  test("caption .removebg hanya memanggil removebg, bukan sticker", async () => {
    const called: string[] = [];
    const message = imageCommand(".removebg");
    expect(message.command()?.name).toBe("removebg");
    expect(message.hasMedia).toBe(true);
    await dispatchMessage(modulesWithHelp(called), {
      message,
      socket: { sendMessage: async () => undefined },
    });
    expect(called).toEqual(["removebg"]);
  });

  test("handler sticker sendiri mengabaikan caption .removebg", async () => {
    const replies: string[] = [];
    const message = mockMessage(".removebg", replies);
    await stickerHandler({
      message,
      modules: [],
      socket: { sendMessage: async () => undefined },
    });
    expect(replies).toEqual([]);
  });

  test("alias .s hanya memanggil sticker", async () => {
    const called: string[] = [];
    await dispatchMessage(modulesWithHelp(called), {
      message: imageCommand(".s"),
      socket: { sendMessage: async () => undefined },
    });
    expect(called).toEqual(["sticker"]);
  });

  test(".help hanya menampilkan daftar kategori, tanpa daftar command", async () => {
    const replies: string[] = [];
    await dispatchMessage(modulesWithHelp([]), {
      message: mockMessage(".help", replies),
      socket: { sendMessage: async () => undefined },
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("*Kategori Bot*");
    expect(replies[0]).toContain("• image");
    expect(replies[0]).toContain("• utils");
    expect(replies[0]).not.toContain("• owner");
    expect(replies[0]).not.toContain(".bgremover");
    expect(replies[0]).not.toContain(".sticker");
    expect(replies[0]).not.toContain(".status");
  });

  test(".help image menampilkan detail kategori tanpa fitur owner", async () => {
    const replies: string[] = [];
    await dispatchMessage(modulesWithHelp([]), {
      message: mockMessage(".help image", replies),
      socket: { sendMessage: async () => undefined },
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("Kategori image");
    expect(replies[0]).toContain(".bgremover");
    expect(replies[0]).toContain(".sticker");
    expect(replies[0]).not.toContain(".status");
  });

  test(".help removebg menjelaskan command dan kategorinya", async () => {
    const replies: string[] = [];
    await dispatchMessage(modulesWithHelp([]), {
      message: mockMessage(".help removebg", replies),
      socket: { sendMessage: async () => undefined },
    });
    expect(replies[0]).toContain("Kategori: image");
    expect(replies[0]).toContain(".bgremover");
    expect(replies[0]).toContain(".removebg");
  });

  test("LID hanya mendapat akses owner bila terpetakan ke nomor di OWNER_NUMBER", async () => {
    const previous = process.env.OWNER_NUMBER;
    process.env.OWNER_NUMBER = "628777777777";
    try {
      const called: string[] = [];
      const message = imageCommand(".status");
      message.sender = "123456789012345@lid";
      const socket = {
        sendMessage: async () => undefined,
        signalRepository: {
          lidMapping: {
            getPNForLID: async () => "628777777777@s.whatsapp.net",
          },
        },
      } as unknown as WASocket;
      await dispatchMessage(modulesWithHelp(called), { message, socket });
      expect(called).toEqual(["status"]);
      const replies: string[] = [];
      const ownerHelp = mockMessage(".help", replies);
      ownerHelp.sender = message.sender;
      await dispatchMessage(modulesWithHelp(called), {
        message: ownerHelp,
        socket,
      });
      expect(replies[0]).toContain("• owner");
      expect(replies[0]).not.toContain(".status");
      called.length = 0;
      const noMapping = { sendMessage: async () => undefined };
      await dispatchMessage(modulesWithHelp(called), {
        message,
        socket: noMapping,
      });
      expect(called).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.OWNER_NUMBER;
      else process.env.OWNER_NUMBER = previous;
    }
  });

  test("non-owner tidak dapat melihat kategori owner atau menjalankan command owner", async () => {
    const called: string[] = [];
    const replies: string[] = [];
    const modules = modulesWithHelp(called);
    const socket = { sendMessage: async () => undefined };
    await dispatchMessage(modules, {
      message: mockMessage(".help owner", replies),
      socket,
    });
    await dispatchMessage(modules, {
      message: mockMessage(".help status", replies),
      socket,
    });
    await dispatchMessage(modules, {
      message: mockMessage(".help", replies),
      socket,
    });
    await dispatchMessage(modules, {
      message: imageCommand(".status"),
      socket,
    });
    expect(called).toEqual([]);
    expect(replies[0]).toContain("tidak ditemukan");
    expect(replies[1]).toContain("tidak ditemukan");
    expect(replies[2]).not.toContain("owner");
    expect(replies[2]).not.toContain(".status");
  });
});
