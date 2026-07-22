import { describe, expect, it } from "bun:test";
import type { Day, LiveMatch } from "@lucarne/shared";
import { patchLive } from "./useSchedule";

type M = Day["matches"][number];

const m = (id: number, over: Partial<M> = {}): M => ({
  id,
  kickoff: "2025-08-16T19:00:00.000Z",
  status: "scheduled",
  statusShort: "NS",
  elapsed: null,
  elapsedExtra: null,
  homeGoals: null,
  awayGoals: null,
  homePenalties: null,
  awayPenalties: null,
  competition: { name: "L1", slug: "l1" },
  home: { name: "A", shortName: null, logo: null },
  away: { name: "B", shortName: null, logo: null },
  broadcasters: [],
  events: [],
  ...over,
});

const day = (matches: M[]): Day => ({ key: "d", label: "d", matches });

describe("patchLive", () => {
  it("returns the same reference when nothing matches", () => {
    const days = [day([m(1)])];
    expect(patchLive(days, [])).toBe(days);
    const noMatch: LiveMatch[] = [
      { id: 999, status: "live", elapsed: 10, elapsedExtra: null, homeGoals: 1, awayGoals: 0, homePenalties: null, awayPenalties: null },
    ];
    expect(patchLive(days, noMatch)).toBe(days);
  });

  it("patches status/elapsed/score for matching matches only", () => {
    const days = [day([m(1), m(2)])];
    const live: LiveMatch[] = [
      { id: 2, status: "live", elapsed: 55, elapsedExtra: null, homeGoals: 2, awayGoals: 1, homePenalties: null, awayPenalties: null },
    ];
    const next = patchLive(days, live);

    expect(next).not.toBe(days);
    expect(next[0].matches[0]).toBe(days[0].matches[0]); // untouched match kept by reference
    expect(next[0].matches[1]).not.toBe(days[0].matches[1]);
    expect(next[0].matches[1].status).toBe("live");
    expect(next[0].matches[1].elapsed).toBe(55);
    expect(next[0].matches[1].homeGoals).toBe(2);
    expect(next[0].matches[1].awayGoals).toBe(1);
  });
});
