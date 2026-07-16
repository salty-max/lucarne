import { describe, expect, it } from "bun:test";
import { runLivePollTick } from "./poller";
import type { LiveWindow, ScheduleCache } from "./scheduleCache";

const cache = (windows: LiveWindow[] | null): ScheduleCache => ({
  getWindows: async () => windows,
  setWindows: async () => {},
});

describe("runLivePollTick — KV gate", () => {
  it("short-circuits to 'no-window' (never touches the DB) when nothing is live", async () => {
    const now = new Date("2025-08-16T04:00:00Z");
    // A window exists but doesn't contain `now`. If the gate failed to
    // short-circuit, the DB query would throw (db isn't initialized in tests).
    const res = await runLivePollTick(now, cache([{ start: 0, end: 1 }]));
    expect(res.polled).toBe(false);
    expect(res.reason).toBe("no-window");
  });

  it("proceeds past the gate (and hits the missing DB) when a window is live", async () => {
    const now = Date.parse("2025-08-16T16:00:00Z");
    const live: LiveWindow[] = [{ start: now - 1000, end: now + 1000 }];
    // Gate passes → it queries the DB → rejects because db isn't initialized.
    // Proves the gate did NOT short-circuit for a live window.
    await expect(runLivePollTick(new Date(now), cache(live))).rejects.toThrow();
  });
});
