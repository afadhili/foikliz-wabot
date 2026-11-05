import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParsedMessage } from "../src/parser";

const directory = await mkdtemp(join(tmpdir(), "wabot-runtime-test-"));
process.env.ANALYTICS_DB_PATH = join(directory, "test.sqlite");
const { getAnalytics } = await import("../src/analytics/store");
const { onMessage: backupCommand } =
  await import("../src/modules/owner/dbbackup");
const { onMessage: restoreCommand } =
  await import("../src/modules/owner/dbrestore");
const {
  allowCommand,
  cachedApi,
  clearCache,
  clearPending,
  enqueueCommand,
  getCacheStats,
  getQueueStats,
  monitorApiCall,
} = await import("../src/analytics/runtime");
afterAll(async () => {
  getAnalytics().close();
  await rm(directory, { recursive: true, force: true });
});

describe("runtime analitik", () => {
  test("batas 12 command per menit per pengirim", () => {
    for (let index = 0; index < 12; index++) {
      expect(allowCommand("user-rate-test", 100_000)).toBe(true);
    }
    expect(allowCommand("user-rate-test", 100_000)).toBe(false);
    expect(allowCommand("user-rate-test", 161_000)).toBe(true);
    expect(allowCommand("user-rate-other", 100_000)).toBe(true);
  });

  test("cache menyimpan hasil sukses dan clear mengosongkan entri", async () => {
    const initial = getCacheStats();
    let calls = 0;
    const loader = async () => ++calls;
    expect(await cachedApi("runtime-test", 60_000, loader)).toBe(1);
    expect(await cachedApi("runtime-test", 60_000, loader)).toBe(1);
    expect(calls).toBe(1);
    expect(getCacheStats().hits).toBe(initial.hits + 1);
    expect(clearCache()).toBeGreaterThanOrEqual(1);
    expect(getCacheStats().entries).toBe(0);
  });

  test("queue berjalan terbatas dan bisa membatalkan yang belum aktif", async () => {
    const releases: Array<() => void> = [];
    const active = Array.from({ length: 4 }, () =>
      enqueueCommand(
        () => new Promise<void>((resolve) => releases.push(resolve)),
      ),
    );
    const queued = enqueueCommand(async () => {
      throw new Error("tidak boleh dijalankan");
    });
    expect(getQueueStats().active).toBe(4);
    expect(getQueueStats().pending).toBe(1);
    expect(clearPending()).toBe(1);
    await expect(queued).rejects.toThrow("dibersihkan");
    releases.forEach((release) => release());
    await Promise.all(active);
    expect(getQueueStats().pending).toBe(0);
  });

  test("backup dan restore hanya lewat reply dokumen di DM dengan CONFIRM", async () => {
    const store = getAnalytics();
    store.recordMessage({
      id: "a",
      chatId: "dm",
      sender: "a@s.whatsapp.net",
      isGroup: false,
      pushName: "A",
      type: "conversation",
    });
    let backup: Buffer | undefined;
    const replies: string[] = [];
    const message = {
      isGroup: false,
      reply: async (content: string | { document: Buffer }) => {
        if (typeof content === "string") replies.push(content);
        else backup = content.document;
      },
      command: () => ({ rest: "CONFIRM" }),
    } as unknown as ParsedMessage;
    await backupCommand({
      message,
      modules: [],
      socket: { sendMessage: async () => undefined },
    });
    expect(backup).toBeInstanceOf(Buffer);
    store.recordMessage({
      id: "b",
      chatId: "dm",
      sender: "b@s.whatsapp.net",
      isGroup: false,
      pushName: "B",
      type: "conversation",
    });
    message.quoted = {
      type: "documentMessage",
      mimetype: "application/vnd.sqlite3",
      raw: { message: { documentMessage: { fileLength: backup!.length } } },
    } as ParsedMessage["quoted"];
    message.downloadMediaFromQuote = async () => backup!;
    await restoreCommand({
      message,
      modules: [],
      socket: { sendMessage: async () => undefined },
    });
    expect(replies.at(-1)).toContain("berhasil dipulihkan");
    expect(store.summary().messages).toBe(1);
    message.isGroup = true;
    await restoreCommand({
      message,
      modules: [],
      socket: { sendMessage: async () => undefined },
    });
    expect(replies.at(-1)).toContain("chat pribadi");
  });

  test("monitor API mencatat sukses dan gagal tanpa menutupi error", async () => {
    expect(await monitorApiCall("test-api", async () => 42)).toBe(42);
    await expect(
      monitorApiCall("test-api", async () => {
        throw new Error("secret query");
      }),
    ).rejects.toThrow("secret query");
    expect(
      getAnalytics()
        .apiUsage()
        .find((entry) => entry.service === "test-api"),
    ).toMatchObject({ calls: 2, errors: 1 });
    expect(getAnalytics().recentErrors(1)[0]?.message).toBe("Error");
  });
});
