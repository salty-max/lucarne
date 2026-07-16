/**
 * Live-window cache used to gate the live poller so it only touches the DB (and
 * the API) when a match is actually live — instead of every 2 min, 24/7.
 *
 * Two implementations:
 *   - Workers: Cloudflare KV (free reads, survives across isolate invocations)
 *   - Bun: an in-memory module variable (fine for a long-lived process)
 *
 * When the cache is empty/unknown (`getWindows()` → null), callers fall back to
 * querying the DB directly — correct, just not as cheap. So a cold cache never
 * silently hides live scores.
 */
export type LiveWindow = { start: number; end: number };

export interface ScheduleCache {
  getWindows(): Promise<LiveWindow[] | null>;
  setWindows(windows: LiveWindow[]): Promise<void>;
}

// --- Node: in-memory ---
let memWindows: LiveWindow[] | null = null;

export const memoryCache: ScheduleCache = {
  async getWindows() {
    return memWindows;
  },
  async setWindows(windows) {
    memWindows = windows;
  },
};

// --- Workers: KV ---
export type KVLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

const KV_KEY = "live_windows";
const KV_TTL_SECONDS = 36 * 60 * 60;

export function kvCache(kv: KVLike): ScheduleCache {
  return {
    async getWindows() {
      const raw = await kv.get(KV_KEY);
      return raw ? (JSON.parse(raw) as LiveWindow[]) : null;
    },
    async setWindows(windows) {
      await kv.put(KV_KEY, JSON.stringify(windows), { expirationTtl: KV_TTL_SECONDS });
    },
  };
}

/** Pick the right cache from a runtime env (Workers binding) — else in-memory. */
export function pickCache(env: unknown): ScheduleCache {
  const kv = (env as { SCHEDULE_KV?: KVLike } | undefined)?.SCHEDULE_KV;
  return kv ? kvCache(kv) : memoryCache;
}
