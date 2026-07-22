import { afterEach, describe, expect, it } from "bun:test";
import { COMPETITIONS, TRACKED_LEAGUE_IDS, currentSeason } from "./competitions";

describe("competitions catalogue", () => {
  it("tracks the competitions with unique slugs + league ids", () => {
    expect(COMPETITIONS).toHaveLength(11);
    expect(new Set(COMPETITIONS.map((c) => c.slug)).size).toBe(COMPETITIONS.length);
    expect(new Set(COMPETITIONS.map((c) => c.apiFootballId)).size).toBe(COMPETITIONS.length);
  });

  it("TRACKED_LEAGUE_IDS mirrors the catalogue", () => {
    expect(TRACKED_LEAGUE_IDS.size).toBe(COMPETITIONS.length);
    for (const c of COMPETITIONS) expect(TRACKED_LEAGUE_IDS.has(c.apiFootballId)).toBe(true);
  });
});

describe("currentSeason", () => {
  const original = process.env.CURRENT_SEASON;
  afterEach(() => {
    if (original === undefined) delete process.env.CURRENT_SEASON;
    else process.env.CURRENT_SEASON = original;
  });

  it("defaults to 2026", () => {
    delete process.env.CURRENT_SEASON;
    expect(currentSeason()).toBe(2026);
  });

  it("reads the env override", () => {
    process.env.CURRENT_SEASON = "2027";
    expect(currentSeason()).toBe(2027);
  });
});
