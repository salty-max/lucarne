import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { app } from "./app";

// These exercise routing/auth/error-handling. No DB is configured in tests, so
// the data routes hit the lazy db proxy, throw, and fall back gracefully — which
// intentionally logs an error, silenced here to keep test output clean.
let errorSpy: ReturnType<typeof spyOn>;
beforeAll(() => {
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => errorSpy.mockRestore());

describe("api routes", () => {
  it("GET /api/schedule degrades to {days:[]} without a DB", async () => {
    const res = await app.request("/api/schedule");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: [] });
  });

  it("GET /api/live degrades to {matches:[]} without a DB", async () => {
    const res = await app.request("/api/live");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [] });
  });

  it("cron routes reject unauthenticated requests with 401", async () => {
    for (const path of ["/api/cron/fixtures", "/api/cron/live", "/api/cron/details"]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
    }
  });

  it("POST /api/admin/seed requires auth (401)", async () => {
    const res = await app.request("/api/admin/seed", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
