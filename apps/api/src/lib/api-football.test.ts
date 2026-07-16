import { afterEach, describe, expect, it, mock } from "bun:test";
import { getFixtureEvents, getFixtures, getLiveFixtures } from "./api-football";

const originalFetch = globalThis.fetch;
const originalKey = process.env.API_FOOTBALL_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.API_FOOTBALL_KEY;
  else process.env.API_FOOTBALL_KEY = originalKey;
});

type Call = { url: URL; headers: Record<string, string> };

function stubFetch(response: { status?: number; body: unknown }): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = mock((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status ?? 200 }),
    );
  }) as unknown as typeof fetch;
  return calls;
}

describe("api-football client", () => {
  it("throws when API_FOOTBALL_KEY is missing", async () => {
    delete process.env.API_FOOTBALL_KEY;
    stubFetch({ body: { response: [] } });
    await expect(getLiveFixtures()).rejects.toThrow(/API_FOOTBALL_KEY/);
  });

  it("getFixtures builds params and sends the key header", async () => {
    process.env.API_FOOTBALL_KEY = "KEY123";
    const calls = stubFetch({ body: { response: [{ fixture: { id: 1 } }] } });
    const res = await getFixtures(61, 2025, "2025-08-01", "2025-08-15");
    expect(res).toEqual([{ fixture: { id: 1 } }] as never);

    const { url, headers } = calls[0];
    expect(url.pathname).toBe("/fixtures");
    expect(url.searchParams.get("league")).toBe("61");
    expect(url.searchParams.get("season")).toBe("2025");
    expect(url.searchParams.get("from")).toBe("2025-08-01");
    expect(url.searchParams.get("to")).toBe("2025-08-15");
    expect(headers["x-apisports-key"]).toBe("KEY123");
  });

  it("getLiveFixtures requests live=all in a single call", async () => {
    process.env.API_FOOTBALL_KEY = "KEY123";
    const calls = stubFetch({ body: { response: [] } });
    await getLiveFixtures();
    expect(calls).toHaveLength(1);
    expect(calls[0].url.searchParams.get("live")).toBe("all");
  });

  it("getFixtureEvents passes the fixture id", async () => {
    process.env.API_FOOTBALL_KEY = "KEY123";
    const calls = stubFetch({ body: { response: [] } });
    await getFixtureEvents(42);
    expect(calls[0].url.pathname).toBe("/fixtures/events");
    expect(calls[0].url.searchParams.get("fixture")).toBe("42");
  });

  it("throws on a non-2xx response", async () => {
    process.env.API_FOOTBALL_KEY = "KEY123";
    stubFetch({ status: 500, body: {} });
    await expect(getLiveFixtures()).rejects.toThrow(/500/);
  });

  it("throws when the API returns an errors object (quota/plan)", async () => {
    process.env.API_FOOTBALL_KEY = "KEY123";
    stubFetch({ body: { response: [], errors: { requests: "limit reached" } } });
    await expect(getLiveFixtures()).rejects.toThrow(/errors/);
  });
});
