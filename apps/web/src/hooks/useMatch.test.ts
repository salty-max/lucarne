import { describe, expect, it } from "bun:test";
import type { MatchDetail } from "@lucarne/shared";
import { pollInterval } from "./useMatch";

const NOW = 1_700_000_000_000;
const LIVE = 30_000;
const SETTLE = 60_000;
const PREGAME = 300_000;

/** Minimal detail — only status + kickoff drive the poll cadence. */
const m = (status: MatchDetail["status"], koOffsetMs: number): MatchDetail =>
  ({ status, kickoff: new Date(NOW + koOffsetMs).toISOString() }) as MatchDetail;

describe("pollInterval", () => {
  it("keeps trying while the first load is pending", () => {
    expect(pollInterval(null, NOW)).toBe(LIVE);
  });

  it("polls fast while live", () => {
    expect(pollInterval(m("live", -20 * 60_000), NOW)).toBe(LIVE);
  });

  it("stops for a postponed match", () => {
    expect(pollInterval(m("postponed", 60 * 60_000), NOW)).toBe(false);
  });

  it("polls gently inside the window (lineups ~40min before kickoff)", () => {
    expect(pollInterval(m("scheduled", 30 * 60_000), NOW)).toBe(SETTLE);
  });

  it("polls gently just after full-time (stats/ratings still landing)", () => {
    expect(pollInterval(m("finished", -60 * 60_000), NOW)).toBe(SETTLE);
  });

  it("WAKES UP: an upcoming match still ticks so it starts polling in time", () => {
    // KO in 3h → window opens in 2h. Must NOT be false, else it'd never pick up
    // lineups without a manual reload (the reported bug).
    expect(pollInterval(m("scheduled", 3 * 60 * 60_000), NOW)).toBe(PREGAME);
  });

  it("wakes exactly at the window edge when it's within one pre-game tick", () => {
    // window opens in 2min (KO in 62min) → tick at the edge, not a full 5min.
    expect(pollInterval(m("scheduled", 62 * 60_000), NOW)).toBe(2 * 60_000);
  });

  it("stops once the match is long over", () => {
    expect(pollInterval(m("finished", -6 * 60 * 60_000), NOW)).toBe(false);
  });
});
