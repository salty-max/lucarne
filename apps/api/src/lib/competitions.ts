/**
 * Static catalogue of tracked competitions + their API-Football league ids.
 * These ids are stable in API-Football and drive the fixture ingestion.
 */
export type CompetitionSeed = {
  slug: string;
  name: string;
  apiFootballId: number;
  country: string;
  type: "league" | "cup";
  /** Per-competition season override (default: currentSeason()). Needed because
   *  tournaments run on a different calendar — e.g. the World Cup is season 2026
   *  while the 2025-26 club leagues are season 2025. */
  season?: number;
};

export const COMPETITIONS: CompetitionSeed[] = [
  { slug: "ligue-1", name: "Ligue 1", apiFootballId: 61, country: "France", type: "league" },
  { slug: "ligue-2", name: "Ligue 2", apiFootballId: 62, country: "France", type: "league" },
  // France's third tier turned professional on 2026-07-01: the Championnat
  // National became **Ligue 3** (18 clubs, 2026-08-07 → 2027-05-21). API-Football
  // kept the old label — league 63 is still called "National 1" there — but it's
  // the same competition and season 2026 already holds the full 306-fixture
  // calendar, so no override is needed.
  { slug: "ligue-3", name: "Ligue 3", apiFootballId: 63, country: "France", type: "league" },
  // The Coupe de France only enters API-Football once its LFP-stage draw is made
  // (the 2025-26 edition ran 2025-11-14 → 2026-05-22), so season 2026 is EMPTY
  // until the autumn and the competition shows up with no matches until then —
  // expected, and it fills itself from the sync cron. No season override: the
  // API labels the 2025-26 edition 2025, so the default already points at 2026-27.
  { slug: "coupe-de-france", name: "Coupe de France", apiFootballId: 66, country: "France", type: "cup" },
  { slug: "trophee-des-champions", name: "Trophée des Champions", apiFootballId: 526, country: "France", type: "cup" },
  { slug: "premier-league", name: "Premier League", apiFootballId: 39, country: "England", type: "league" },
  { slug: "la-liga", name: "La Liga", apiFootballId: 140, country: "Spain", type: "league" },
  { slug: "bundesliga", name: "Bundesliga", apiFootballId: 78, country: "Germany", type: "league" },
  { slug: "champions-league", name: "Champions League", apiFootballId: 2, country: "Europe", type: "cup" },
  { slug: "europa-league", name: "Europa League", apiFootballId: 3, country: "Europe", type: "cup" },
  { slug: "conference-league", name: "Conference League", apiFootballId: 848, country: "Europe", type: "cup" },
  { slug: "nations-league", name: "Nations League", apiFootballId: 5, country: "Europe", type: "cup" },
  { slug: "world-cup", name: "World Cup", apiFootballId: 1, country: "World", type: "cup", season: 2026 },
  // J1 League switched from a spring–autumn calendar to autumn–spring: the first
  // such season (2026-08 → 2027-06) is labelled 2027 in API-Football and is the
  // one marked current, so it needs the override — the default 2026 points at the
  // transitional half-season that ended in June 2026. Bump this each year until a
  // per-competition "current season" lookup exists. No traditional French rights
  // holder, so it streams free on YouTube (J.League International) — see seed-data.
  { slug: "j1-league", name: "J1 League", apiFootballId: 98, country: "Japan", type: "league", season: 2027 },
  // J3 also moved to autumn–spring, but API-Football labels ITS 2026-27 season
  // **2026** (not 2027 like J1 — the labelling is inconsistent across the tiers),
  // 380 fixtures from 2026-08-08. Same manual-bump caveat as J1; no French
  // broadcaster either. J2 (id 99) is deliberately NOT here yet: API-Football
  // still only has its finished 2025 calendar-year season — 0 fixtures for
  // 2026/2027 — so there is nothing to show. Add it once they publish it.
  { slug: "j3-league", name: "J3 League", apiFootballId: 100, country: "Japan", type: "league", season: 2026 },
];

/** Read lazily (not at module eval) so it works on Workers where env is
 *  only populated inside a request/scheduled context. */
export function currentSeason(): number {
  return Number(process.env.CURRENT_SEASON ?? "2026");
}

/** Set of tracked API-Football league ids (used to filter `live=all`). */
export const TRACKED_LEAGUE_IDS = new Set(COMPETITIONS.map((c) => c.apiFootballId));
