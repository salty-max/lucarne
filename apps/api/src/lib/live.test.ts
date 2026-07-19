import { describe, expect, it } from "bun:test";
import {
  DAILY_API_BUDGET,
  budgetRemaining,
  candidateKickoffRange,
  decideLivePoll,
  liveWindow,
  type BudgetState,
} from "./live";

const state = (over: Partial<BudgetState> = {}): BudgetState => ({
  utcDate: "2025-08-16",
  requestsToday: 0,
  lastPollAt: null,
  ...over,
});

describe("liveWindow", () => {
  it("spans 5 min before to 210 min after kickoff", () => {
    const k = new Date("2025-08-16T19:00:00Z");
    const w = liveWindow(k);
    expect(w.start).toBe(k.getTime() - 5 * 60_000);
    expect(w.end).toBe(k.getTime() + 210 * 60_000);
  });
});

describe("candidateKickoffRange", () => {
  it("brackets now by [-210min, +5min]", () => {
    const now = Date.parse("2025-08-16T19:00:00Z");
    const { earliest, latest } = candidateKickoffRange(now);
    expect(latest.getTime() - now).toBe(5 * 60_000);
    expect(now - earliest.getTime()).toBe(210 * 60_000);
  });
});

describe("budgetRemaining", () => {
  it("is budget minus used, floored at 0", () => {
    expect(budgetRemaining(state({ requestsToday: 5 }))).toBe(DAILY_API_BUDGET - 5);
    expect(budgetRemaining(state({ requestsToday: DAILY_API_BUDGET + 10 }))).toBe(0);
  });
});

describe("decideLivePoll", () => {
  const now = Date.parse("2025-08-16T16:00:00Z");
  const soon = now + 60 * 60_000;

  it("skips when nothing is live", () => {
    const d = decideLivePoll({ nowMs: now, liveCount: 0, windowEndMs: null, state: state() });
    expect(d.poll).toBe(false);
    expect(d.reason).toBe("no-live");
  });

  it("skips when the budget is exhausted", () => {
    const d = decideLivePoll({
      nowMs: now,
      liveCount: 3,
      windowEndMs: soon,
      state: state({ requestsToday: DAILY_API_BUDGET }),
    });
    expect(d.poll).toBe(false);
    expect(d.reason).toBe("budget-exhausted");
  });

  it("polls on the first tick when live", () => {
    const d = decideLivePoll({ nowMs: now, liveCount: 4, windowEndMs: soon, state: state() });
    expect(d.poll).toBe(true);
    expect(d.reason).toBe("poll");
  });

  it("throttles when the last poll was too recent", () => {
    const d = decideLivePoll({
      nowMs: now,
      liveCount: 4, // base interval 60s
      windowEndMs: soon,
      state: state({ lastPollAt: new Date(now - 30_000).toISOString() }),
    });
    expect(d.poll).toBe(false);
    expect(d.reason).toBe("throttled");
  });

  it("uses a 60s base cadence when the budget is ample (Pro plan)", () => {
    // Full budget + a long live window → the budget-aware stretch is a no-op, so
    // the base cadence rules: a fresh 60s.
    const d = decideLivePoll({
      nowMs: now,
      liveCount: 1,
      windowEndMs: now + 300 * 60_000,
      state: state(),
    });
    expect(d.poll).toBe(true);
    expect(d.intervalMs).toBe(60_000);
  });

  it("polls again once the interval has elapsed", () => {
    const d = decideLivePoll({
      nowMs: now,
      liveCount: 4,
      windowEndMs: soon,
      state: state({ lastPollAt: new Date(now - 10 * 60_000).toISOString() }),
    });
    expect(d.poll).toBe(true);
  });

  it("stretches the interval to spread a low budget over a long window", () => {
    // 1 live match → base interval 8 min, but only 2 requests left over 5h.
    const d = decideLivePoll({
      nowMs: now,
      liveCount: 1,
      windowEndMs: now + 300 * 60_000,
      state: state({ requestsToday: DAILY_API_BUDGET - 2 }),
    });
    // evenInterval = 300min / 2 = 150min, wider than the 8min base.
    expect(d.intervalMs).toBeGreaterThanOrEqual(150 * 60_000 - 1);
  });
});
