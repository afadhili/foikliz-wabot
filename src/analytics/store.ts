import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const MAX_ERRORS = 500;
const MAX_ACTIVITY = 1_000;
const SCHEMA_VERSION = 1;

const schema = [
  `CREATE TABLE messages (
    chat_id TEXT NOT NULL, id TEXT NOT NULL, sender TEXT NOT NULL,
    is_group INTEGER NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (chat_id, id)
  )`,
  `CREATE INDEX messages_created_at ON messages (created_at, sender)`,
  `CREATE TABLE users (
    sender TEXT PRIMARY KEY, push_name TEXT NOT NULL, messages INTEGER NOT NULL
  )`,
  `CREATE TABLE groups (
    chat_id TEXT PRIMARY KEY, messages INTEGER NOT NULL
  )`,
  `CREATE TABLE command_stats (
    name TEXT PRIMARY KEY, count INTEGER NOT NULL, ok INTEGER NOT NULL,
    errors INTEGER NOT NULL, limited INTEGER NOT NULL, total_ms REAL NOT NULL
  )`,
  `CREATE TABLE totals (
    key TEXT PRIMARY KEY, value INTEGER NOT NULL
  )`,
  `CREATE TABLE api_stats (
    service TEXT PRIMARY KEY, calls INTEGER NOT NULL,
    errors INTEGER NOT NULL, total_ms REAL NOT NULL
  )`,
  `CREATE TABLE errors (
    id INTEGER PRIMARY KEY, scope TEXT NOT NULL, message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE activity (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, chat_id TEXT,
    sender TEXT, created_at TEXT NOT NULL
  )`,
] as const;

const tables = [
  "messages",
  "users",
  "groups",
  "command_stats",
  "totals",
  "api_stats",
  "errors",
  "activity",
] as const;

const columns: Record<(typeof tables)[number], string[]> = {
  messages: ["chat_id", "id", "sender", "is_group", "type", "created_at"],
  users: ["sender", "push_name", "messages"],
  groups: ["chat_id", "messages"],
  command_stats: ["name", "count", "ok", "errors", "limited", "total_ms"],
  totals: ["key", "value"],
  api_stats: ["service", "calls", "errors", "total_ms"],
  errors: ["id", "scope", "message", "created_at"],
  activity: ["id", "kind", "chat_id", "sender", "created_at"],
};

function copyRows(source: Database, target: Database): void {
  // Table and column names come exclusively from this module, never from the backup.
  for (const table of tables) {
    const fields = columns[table];
    const insert = target.query(
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
    );
    for (const row of source
      .query(`SELECT ${fields.join(", ")} FROM ${table}`)
      .all() as Array<Record<string, string | number | null>>) {
      insert.run(...fields.map((field) => row[field]));
    }
  }
}

function identifier(value: string, field: string): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 256 ||
    /[\x00-\x1f\x7f]/.test(value)
  ) {
    throw new TypeError(`Invalid ${field}`);
  }
  return value;
}

// Labels are never free-form message content (or exception messages).
function label(value: string): string {
  return typeof value === "string" && /^[a-zA-Z0-9_.:/@-]{1,128}$/.test(value)
    ? value
    : "unknown";
}

function duration(value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new TypeError("Invalid durationMs");
  return Math.min(value, 86_400_000);
}

function errorCategory(error: unknown): string {
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof ReferenceError) return "ReferenceError";
  if (error instanceof Error) return "Error";
  return "Unknown error";
}

function boundedLimit(limit: number, fallback: number): number {
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(0, Math.min(100, Math.trunc(limit)));
}

function assertSchema(db: Database): void {
  const version = db.query("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (version.user_version !== SCHEMA_VERSION)
    throw new Error("Unsupported analytics backup version");
  const check = db.query("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  if (check.integrity_check !== "ok")
    throw new Error("Corrupt analytics backup");

  const objects = db
    .query("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL")
    .all() as Array<{
    name: string;
    sql: string;
  }>;
  const expected = new Map(
    schema.map((sql) => {
      const name = sql.match(/^CREATE (?:TABLE|INDEX) (\w+)/)![1];
      return [name, sql.replace(/\s+/g, " ").trim()];
    }),
  );
  if (
    objects.length !== expected.size ||
    objects.some(
      ({ name, sql }) => expected.get(name) !== sql.replace(/\s+/g, " ").trim(),
    )
  )
    throw new Error("Invalid analytics backup schema");
}

export class AnalyticsStore {
  private readonly db: Database;
  private closed = false;

  constructor(path = process.env.ANALYTICS_DB_PATH || "./data/bot.sqlite") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode=WAL");
    const existing = this.db
      .query(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE sql IS NOT NULL",
      )
      .get() as { count: number };
    if (existing.count === 0) {
      this.db.transaction(() => {
        for (const statement of schema) this.db.exec(statement);
        this.db.exec("INSERT INTO totals (key, value) VALUES ('errors', 0)");
        this.db.exec("PRAGMA user_version=1");
      })();
    } else {
      assertSchema(this.db);
    }
  }

  recordMessage(message: {
    id: string;
    chatId: string;
    sender: string;
    isGroup: boolean;
    pushName: string;
    type: string;
    timestamp?: number;
  }): void {
    const id = identifier(message.id, "id");
    const chatId = identifier(message.chatId, "chatId");
    const sender = identifier(message.sender, "sender");
    if (typeof message.isGroup !== "boolean")
      throw new TypeError("Invalid isGroup");
    const timestamp = message.timestamp ?? Date.now(); // Unix milliseconds; UTC for DAU.
    if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp))
      throw new TypeError("Invalid timestamp");
    const createdAt = new Date(timestamp).toISOString();
    const pushName =
      typeof message.pushName === "string"
        ? message.pushName.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 128)
        : "";
    const type = label(message.type);
    this.db.transaction(() => {
      const inserted = this.db
        .query(
          `INSERT OR IGNORE INTO messages
        (chat_id, id, sender, is_group, type, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(chatId, id, sender, Number(message.isGroup), type, createdAt);
      if (!inserted.changes) return;
      this.db
        .query(
          `INSERT INTO users (sender, push_name, messages) VALUES (?, ?, 1)
        ON CONFLICT(sender) DO UPDATE SET messages = messages + 1, push_name = excluded.push_name`,
        )
        .run(sender, pushName);
      if (message.isGroup)
        this.db
          .query(
            `INSERT INTO groups (chat_id, messages) VALUES (?, 1)
        ON CONFLICT(chat_id) DO UPDATE SET messages = messages + 1`,
          )
          .run(chatId);
    })();
  }

  recordCommand(command: {
    name: string;
    sender: string;
    chatId: string;
    status: "ok" | "error" | "limited";
    durationMs: number;
  }): void {
    const name = label(command.name);
    identifier(command.sender, "sender");
    identifier(command.chatId, "chatId");
    if (!["ok", "error", "limited"].includes(command.status))
      throw new TypeError("Invalid status");
    const ms = duration(command.durationMs);
    // Only aggregate counts and timings are retained; command context is not logged.
    const ok = Number(command.status === "ok");
    const errors = Number(command.status === "error");
    const limited = Number(command.status === "limited");
    this.db
      .query(
        `INSERT INTO command_stats (name, count, ok, errors, limited, total_ms)
      VALUES (?, 1, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET count = count + 1, ok = ok + excluded.ok,
      errors = errors + excluded.errors, limited = limited + excluded.limited,
      total_ms = total_ms + excluded.total_ms`,
      )
      .run(name, ok, errors, limited, ms);
  }

  recordError(scope: string, error: unknown): void {
    this.db.transaction(() => {
      this.db
        .query(
          "INSERT INTO errors (scope, message, created_at) VALUES (?, ?, ?)",
        )
        .run(label(scope), errorCategory(error), new Date().toISOString());
      this.db
        .query("UPDATE totals SET value = value + 1 WHERE key = 'errors'")
        .run();
      this.db
        .query(
          "DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY id DESC LIMIT ?)",
        )
        .run(MAX_ERRORS);
    })();
  }

  recordActivity(kind: string, chatId?: string, sender?: string): void {
    this.db.transaction(() => {
      this.db
        .query(
          "INSERT INTO activity (kind, chat_id, sender, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(
          label(kind),
          chatId === undefined ? null : identifier(chatId, "chatId"),
          sender === undefined ? null : identifier(sender, "sender"),
          new Date().toISOString(),
        );
      this.db
        .query(
          "DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT ?)",
        )
        .run(MAX_ACTIVITY);
    })();
  }

  recordApiCall(service: string, ok: boolean, durationMs: number): void {
    if (typeof ok !== "boolean") throw new TypeError("Invalid ok");
    this.db
      .query(
        `INSERT INTO api_stats (service, calls, errors, total_ms) VALUES (?, 1, ?, ?)
      ON CONFLICT(service) DO UPDATE SET calls = calls + 1,
      errors = errors + excluded.errors, total_ms = total_ms + excluded.total_ms`,
      )
      .run(label(service), Number(!ok), duration(durationMs));
  }

  summary(): {
    users: number;
    groups: number;
    messages: number;
    dau: number;
    totalCommands: number;
    errors: number;
  } {
    const today = new Date().toISOString().slice(0, 10);
    return this.db
      .query(
        `SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM groups) AS groups,
      (SELECT COUNT(*) FROM messages) AS messages,
      (SELECT COUNT(DISTINCT sender) FROM messages WHERE created_at >= ? AND created_at < ?) AS dau,
      (SELECT COALESCE(SUM(count), 0) FROM command_stats) AS totalCommands,
      (SELECT value FROM totals WHERE key = 'errors') AS errors`,
      )
      .get(
        today,
        new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10),
      ) as ReturnType<AnalyticsStore["summary"]>;
  }

  messageStats(): {
    today: number;
    byType: Array<{ type: string; count: number }>;
  } {
    const today = new Date().toISOString().slice(0, 10);
    return {
      today: (
        this.db
          .query(
            "SELECT COUNT(*) AS count FROM messages WHERE created_at >= ? AND created_at < ?",
          )
          .get(
            today,
            new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10),
          ) as { count: number }
      ).count,
      byType: this.db
        .query(
          "SELECT type, COUNT(*) AS count FROM messages GROUP BY type ORDER BY count DESC, type ASC LIMIT 10",
        )
        .all() as Array<{ type: string; count: number }>,
    };
  }

  topCommands(limit = 10): Array<{ name: string; count: number }> {
    return this.db
      .query(
        "SELECT name, count FROM command_stats ORDER BY count DESC, name ASC LIMIT ?",
      )
      .all(boundedLimit(limit, 10)) as Array<{ name: string; count: number }>;
  }

  recentErrors(
    limit = 10,
  ): Array<{ scope: string; message: string; createdAt: string }> {
    return this.db
      .query(
        "SELECT scope, message, created_at AS createdAt FROM errors ORDER BY id DESC LIMIT ?",
      )
      .all(boundedLimit(limit, 10)) as ReturnType<
      AnalyticsStore["recentErrors"]
    >;
  }

  recentActivity(limit = 10): Array<{
    kind: string;
    chatId: string | null;
    sender: string | null;
    createdAt: string;
  }> {
    return this.db
      .query(
        `SELECT kind, chat_id AS chatId, sender, created_at AS createdAt
      FROM activity ORDER BY id DESC LIMIT ?`,
      )
      .all(boundedLimit(limit, 10)) as ReturnType<
      AnalyticsStore["recentActivity"]
    >;
  }

  apiUsage(): Array<{
    service: string;
    calls: number;
    errors: number;
    avgMs: number;
  }> {
    return this.db
      .query(
        `SELECT service, calls, errors, total_ms / calls AS avgMs
      FROM api_stats ORDER BY calls DESC, service ASC`,
      )
      .all() as ReturnType<AnalyticsStore["apiUsage"]>;
  }

  backup(): Buffer {
    const snapshot = new Database(":memory:");
    try {
      for (const statement of schema) snapshot.exec(statement);
      snapshot.exec("PRAGMA user_version=1");
      // A read transaction gives the copy one consistent view, including WAL writes.
      this.db.exec("BEGIN");
      try {
        snapshot.transaction(() => copyRows(this.db, snapshot))();
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      const data = snapshot.serialize();
      if (data.length > MAX_BACKUP_BYTES)
        throw new Error("Analytics backup exceeds 32 MiB");
      return data;
    } finally {
      snapshot.close();
    }
  }

  restore(data: Buffer): void {
    if (
      !Buffer.isBuffer(data) ||
      data.length < 100 ||
      data.length > MAX_BACKUP_BYTES ||
      data.subarray(0, 16).toString("binary") !== "SQLite format 3\0"
    ) {
      throw new Error("Invalid analytics backup");
    }
    let source: Database | undefined;
    try {
      source = Database.deserialize(data, { readonly: true, strict: true });
      assertSchema(source);
      const validSource = source;
      this.db.transaction(() => {
        for (const table of [...tables].reverse())
          this.db.exec(`DELETE FROM ${table}`);
        copyRows(validSource, this.db);
        const counts = this.db
          .query(
            `SELECT
          (SELECT COUNT(*) FROM messages) AS messages,
          (SELECT COALESCE(SUM(messages), 0) FROM users) AS userMessages,
          (SELECT COUNT(*) FROM messages WHERE is_group = 1) AS groupMessages,
          (SELECT COALESCE(SUM(messages), 0) FROM groups) AS storedGroupMessages,
          (SELECT COUNT(*) FROM errors) AS errors,
          (SELECT COUNT(*) FROM activity) AS activity,
          (SELECT COUNT(*) FROM totals WHERE key = 'errors' AND value >= 0) AS totalRows,
          (SELECT value FROM totals WHERE key = 'errors') AS totalErrors,
          (SELECT COUNT(*) FROM command_stats WHERE count != ok + errors + limited OR count < 0) AS badCommands,
          (SELECT COUNT(*) FROM api_stats WHERE calls < errors OR errors < 0 OR calls < 1) AS badApi`,
          )
          .get() as {
          messages: number;
          userMessages: number;
          groupMessages: number;
          storedGroupMessages: number;
          errors: number;
          activity: number;
          totalRows: number;
          totalErrors: number;
          badCommands: number;
          badApi: number;
        };
        if (
          counts.messages !== counts.userMessages ||
          counts.groupMessages !== counts.storedGroupMessages ||
          counts.errors > MAX_ERRORS ||
          counts.activity > MAX_ACTIVITY ||
          counts.totalRows !== 1 ||
          counts.totalErrors < counts.errors ||
          counts.badCommands !== 0 ||
          counts.badApi !== 0
        ) {
          throw new Error("Inconsistent analytics backup");
        }
      })();
    } finally {
      source?.close();
    }
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  /** Used by the lazy singleton after close(). */
  get isClosed(): boolean {
    return this.closed;
  }
}

let singleton: AnalyticsStore | undefined;
export function getAnalytics(): AnalyticsStore {
  if (!singleton || singleton.isClosed) singleton = new AnalyticsStore();
  return singleton;
}
