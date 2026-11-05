import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnalyticsStore } from "../src/analytics/store";

const stores: AnalyticsStore[] = [];
const directories: string[] = [];
function store(path = ":memory:"): AnalyticsStore {
  const instance = new AnalyticsStore(path);
  stores.push(instance);
  return instance;
}

afterEach(() => {
  for (const instance of stores.splice(0)) instance.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("AnalyticsStore", () => {
  test("deduplicates per chat, counts groups, users, UTC DAU and commands", () => {
    const db = store();
    const today = Date.now();
    const message = {
      id: "1",
      chatId: "group@g.us",
      sender: "alice",
      isGroup: true,
      pushName: "Alice",
      type: "text",
      timestamp: today,
    };
    db.recordMessage(message);
    db.recordMessage({ ...message, sender: "other" });
    db.recordMessage({ ...message, id: "2", sender: "bob", timestamp: 0 });
    db.recordMessage({ ...message, chatId: "private", isGroup: false });
    db.recordCommand({
      name: "help",
      sender: "alice",
      chatId: "private",
      status: "ok",
      durationMs: 5,
    });
    db.recordCommand({
      name: "help",
      sender: "bob",
      chatId: "private",
      status: "limited",
      durationMs: 2,
    });
    db.recordCommand({
      name: "ping",
      sender: "alice",
      chatId: "private",
      status: "error",
      durationMs: 1,
    });
    expect(db.summary()).toEqual({
      users: 2,
      groups: 1,
      messages: 3,
      dau: 1,
      totalCommands: 3,
      errors: 0,
    });
    expect(db.topCommands()).toEqual([
      { name: "help", count: 2 },
      { name: "ping", count: 1 },
    ]);
    expect(db.topCommands(1)).toHaveLength(1);
    expect(db.topCommands(0)).toEqual([]);
    expect(db.messageStats()).toEqual({
      today: 2,
      byType: [{ type: "text", count: 3 }],
    });
  });

  test("logs only categorized errors, bounds logs and aggregates API usage", () => {
    const db = store();
    db.recordError("api", new Error("token=super-secret and message body"));
    db.recordError("message body with spaces", "secret value");
    db.recordActivity("startup");
    db.recordActivity("join", "group@g.us", "alice");
    db.recordApiCall("weather", true, 10);
    db.recordApiCall("weather", false, 20);
    expect(db.recentErrors()).toMatchObject([
      { scope: "unknown", message: "Unknown error" },
      { scope: "api", message: "Error" },
    ]);
    expect(db.recentErrors(10)[0]!.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(db.recentActivity()).toMatchObject([
      { kind: "join", chatId: "group@g.us", sender: "alice" },
      { kind: "startup", chatId: null, sender: null },
    ]);
    expect(db.apiUsage()).toEqual([
      { service: "weather", calls: 2, errors: 1, avgMs: 15 },
    ]);
    for (let i = 0; i < 505; i++)
      db.recordError("api", new TypeError("private"));
    for (let i = 0; i < 1005; i++) db.recordActivity("event");
    expect(db.summary().errors).toBe(507);
    expect(db.recentErrors(1000)).toHaveLength(100);
    expect(db.recentActivity(1000)).toHaveLength(100);
  });

  test("backup includes WAL writes, restores atomically, and remains writable", () => {
    const directory = mkdtempSync(join(tmpdir(), "analytics-store-"));
    directories.push(directory);
    const db = store(join(directory, "nested", "bot.sqlite"));
    db.recordMessage({
      id: "one",
      chatId: "chat",
      sender: "alice",
      isGroup: false,
      pushName: "Alice",
      type: "text",
    });
    db.recordError("api", new Error("secret"));
    const backup = db.backup();
    const restored = store(join(directory, "target.sqlite"));
    restored.recordMessage({
      id: "old",
      chatId: "old",
      sender: "old",
      isGroup: false,
      pushName: "",
      type: "text",
    });
    restored.restore(backup);
    expect(restored.summary()).toEqual(db.summary());
    restored.recordMessage({
      id: "two",
      chatId: "chat",
      sender: "alice",
      isGroup: false,
      pushName: "Alice",
      type: "text",
    });
    expect(restored.summary().messages).toBe(2);
    restored.restore(backup);
    expect(restored.summary().messages).toBe(1);
    restored.close();
    expect(store(join(directory, "target.sqlite")).summary().messages).toBe(1);
    db.close();
    expect(
      store(join(directory, "nested", "bot.sqlite")).summary().messages,
    ).toBe(1);
  });

  test("rejects invalid schema, corrupted or inconsistent backup without losing live data", () => {
    const db = store();
    db.recordMessage({
      id: "one",
      chatId: "chat",
      sender: "alice",
      isGroup: false,
      pushName: "",
      type: "text",
    });
    expect(() => db.restore(Buffer.from("not sqlite"))).toThrow();
    const foreign = new Database(":memory:");
    foreign.exec("PRAGMA user_version=1; CREATE TABLE messages (id TEXT)");
    expect(() => db.restore(foreign.serialize())).toThrow();
    foreign.close();
    const altered = Database.deserialize(db.backup());
    altered.exec("UPDATE users SET messages=500");
    expect(() => db.restore(altered.serialize())).toThrow("Inconsistent");
    altered.close();
    expect(db.summary().messages).toBe(1);
    db.recordMessage({
      id: "two",
      chatId: "chat",
      sender: "alice",
      isGroup: false,
      pushName: "",
      type: "text",
    });
    expect(db.summary().messages).toBe(2);
  });
});
