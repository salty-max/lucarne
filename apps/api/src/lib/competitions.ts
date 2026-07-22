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
  // per-competition "current season" lookup exists. No French broadcaster holds
  // the rights, so fixtures show with no channel; that is expected, not a gap.
  { slug: "j1-league", name: "J1 League", apiFootballId: 98, country: "Japan", type: "league", season: 2027 },
];

/** Read lazily (not at module eval) so it works on Workers where env is
 *  only populated inside a request/scheduled context. */
export function currentSeason(): number {
  return Number(process.env.CURRENT_SEASON ?? "2026");
}

/** Set of tracked API-Football league ids (used to filter `live=all`). */
export const TRACKED_LEAGUE_IDS = new Set(COMPETITIONS.map((c) => c.apiFootballId));
