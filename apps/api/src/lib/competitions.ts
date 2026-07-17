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
  { slug: "world-cup", name: "World Cup", apiFootballId: 1, country: "World", type: "cup", season: 2026 },
];

/** Read lazily (not at module eval) so it works on Workers where env is
 *  only populated inside a request/scheduled context. */
export function currentSeason(): number {
  return Number(process.env.CURRENT_SEASON ?? "2026");
}

/** Set of tracked API-Football league ids (used to filter `live=all`). */
export const TRACKED_LEAGUE_IDS = new Set(COMPETITIONS.map((c) => c.apiFootballId));
