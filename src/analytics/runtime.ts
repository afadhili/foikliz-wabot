import { getAnalytics } from "./store";

const MAX_PENDING = 100;
const MAX_ACTIVE = 4;
const MAX_CACHE_ENTRIES = 100;
const CACHE_KEY_LIMIT = 600;

type Job = {
  run: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};
const pending: Job[] = [];
let active = 0;
let completed = 0;
let failed = 0;

function drain(): void {
  while (active < MAX_ACTIVE && pending.length) {
    const job = pending.shift()!;
    active++;
    void job
      .run()
      .then(
        () => {
          completed++;
          job.resolve();
        },
        (error: unknown) => {
          failed++;
          job.reject(error instanceof Error ? error : new Error(String(error)));
        },
      )
      .finally(() => {
        active--;
        drain();
      });
  }
}

export function enqueueCommand(run: () => Promise<void>): Promise<void> {
  if (pending.length >= MAX_PENDING)
    return Promise.reject(new Error("Antrean command penuh."));
  return new Promise((resolve, reject) => {
    pending.push({ run, resolve, reject });
    drain();
  });
}

export function getQueueStats() {
  return { active, pending: pending.length, completed, failed };
}

export function clearPending(): number {
  const removed = pending.splice(0);
  failed += removed.length;
  for (const job of removed) {
    job.reject(new Error("Antrean command dibersihkan oleh owner."));
  }
  return removed.length;
}

interface CacheEntry {
  expires: number;
  value: unknown;
}
const cache = new Map<string, CacheEntry>();
let hits = 0;
let misses = 0;

export async function cachedApi<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  if (key.length > CACHE_KEY_LIMIT || ttlMs <= 0) return loader();
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    hits++;
    return entry.value as T;
  }
  if (entry) cache.delete(key);
  misses++;
  const value = await loader();
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

export function getCacheStats() {
  for (const [key, entry] of cache) {
    if (entry.expires <= Date.now()) cache.delete(key);
  }
  return { entries: cache.size, hits, misses };
}

export function clearCache(): number {
  const count = cache.size;
  cache.clear();
  return count;
}

export async function monitorApiCall<T>(
  service: string,
  action: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  let ok = false;
  try {
    const result = await action();
    ok = true;
    return result;
  } catch (error) {
    try {
      getAnalytics().recordError(`api.${service}`, error);
    } catch (loggingError) {
      console.error("Gagal mencatat error API:", loggingError);
    }
    throw error;
  } finally {
    try {
      getAnalytics().recordApiCall(service, ok, performance.now() - started);
    } catch (error) {
      console.error("Gagal mencatat pemakaian API:", error);
    }
  }
}

// Sliding window per sender; bounded to avoid retaining inactive senders indefinitely.
const requests = new Map<string, number[]>();
const rateWarnings = new Map<string, number>();
const RATE_WINDOW_MS = 60_000;
const MAX_COMMANDS_PER_MINUTE = 12;
export function allowCommand(sender: string, now = Date.now()): boolean {
  if (requests.size > 2_000) {
    for (const [id, times] of requests) {
      if (!times.length || times[times.length - 1]! <= now - RATE_WINDOW_MS)
        requests.delete(id);
    }
    for (const [id, warnedAt] of rateWarnings) {
      if (warnedAt <= now - RATE_WINDOW_MS) rateWarnings.delete(id);
    }
  }
  const times = (requests.get(sender) ?? []).filter(
    (time) => time > now - RATE_WINDOW_MS,
  );
  if (times.length >= MAX_COMMANDS_PER_MINUTE) {
    requests.set(sender, times);
    return false;
  }
  times.push(now);
  requests.set(sender, times);
  return true;
}

export function shouldNotifyRateLimit(
  sender: string,
  now = Date.now(),
): boolean {
  if ((rateWarnings.get(sender) ?? 0) > now - RATE_WINDOW_MS) return false;
  rateWarnings.set(sender, now);
  return true;
}
