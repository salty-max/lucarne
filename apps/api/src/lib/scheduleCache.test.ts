import { describe, expect, it } from "bun:test";
import { kvCache, memoryCache, pickCache, type KVLike, type LiveWindow } from "./scheduleCache";

const windows: LiveWindow[] = [
  { start: 1, end: 2 },
  { start: 3, end: 4 },
];

function fakeKv() {
  const store = new Map<string, string>();
  const kv: KVLike = {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => {
      store.set(k, v);
    },
  };
  return { kv, store };
}

describe("memoryCache", () => {
  it("round-trips windows", async () => {
    await memoryCache.setWindows(windows);
    expect(await memoryCache.getWindows()).toEqual(windows);
  });
});

describe("kvCache", () => {
  it("returns null when empty", async () => {
    const { kv } = fakeKv();
    expect(await kvCache(kv).getWindows()).toBeNull();
  });

  it("serializes to JSON under live_windows and reads back", async () => {
    const { kv, store } = fakeKv();
    const c = kvCache(kv);
    await c.setWindows(windows);
    expect(JSON.parse(store.get("live_windows")!)).toEqual(windows);
    expect(await c.getWindows()).toEqual(windows);
  });
});

describe("pickCache", () => {
  it("uses the KV binding when present", async () => {
    const { kv } = fakeKv();
    await pickCache({ SCHEDULE_KV: kv }).setWindows(windows);
    expect(await kv.get("live_windows")).not.toBeNull();
  });

  it("falls back to the in-memory cache without a binding", () => {
    expect(pickCache(undefined)).toBe(memoryCache);
    expect(pickCache({})).toBe(memoryCache);
  });
});
