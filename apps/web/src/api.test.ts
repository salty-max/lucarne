import { afterEach, describe, expect, it, mock } from "bun:test";
import { fetchLive, fetchSchedule } from "./api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stub(status: number, body: unknown) {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ) as unknown as typeof fetch;
}

describe("fetchSchedule", () => {
  it("returns the days on success", async () => {
    stub(200, { days: [{ key: "d", label: "d", matches: [] }] });
    expect(await fetchSchedule()).toHaveLength(1);
  });

  it("returns [] when days is missing", async () => {
    stub(200, {});
    expect(await fetchSchedule()).toEqual([]);
  });

  it("throws on a non-ok response", async () => {
    stub(500, {});
    await expect(fetchSchedule()).rejects.toThrow();
  });
});

describe("fetchLive", () => {
  it("returns the matches on success", async () => {
    stub(200, { matches: [{ id: 1, status: "live", elapsed: 5, homeGoals: 0, awayGoals: 0 }] });
    expect(await fetchLive()).toHaveLength(1);
  });

  it("returns [] on a non-ok response (no throw)", async () => {
    stub(500, {});
    expect(await fetchLive()).toEqual([]);
  });
});
