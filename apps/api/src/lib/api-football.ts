/**
 * Thin API-Football (api-sports.io v3) client.
 * Free plan = 100 requests/day, resets 00:00 UTC. Every call here costs 1 request,
 * so callers are responsible for budgeting (see src/lib/live.ts).
 */
const BASE_URL = "https://v3.football.api-sports.io";

function key(): string {
  const k = process.env.API_FOOTBALL_KEY;
  if (!k) throw new Error("Missing API_FOOTBALL_KEY");
  return k;
}

type ApiResponse<T> = {
  response: T;
  results: number;
  errors: unknown;
  paging: { current: number; total: number };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(
  path: string,
  params: Record<string, string | number>,
  attempt = 0,
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: { "x-apisports-key": key() },
    // Always hit the network — this data is the source of truth, never cache it.
    cache: "no-store",
  });

  // Retry transient rate limits (per-minute/burst cap) with backoff.
  if (res.status === 429 && attempt < 4) {
    await sleep(1500 * (attempt + 1));
    return call<T>(path, params, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`API-Football ${path} -> ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as ApiResponse<T>;
  // API-Football returns 200 with an `errors` object on quota/plan problems.
  if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
    const isRateLimit = "rateLimit" in (json.errors as Record<string, unknown>);
    if (isRateLimit && attempt < 4) {
      await sleep(1500 * (attempt + 1));
      return call<T>(path, params, attempt + 1);
    }
    throw new Error(`API-Football ${path} errors: ${JSON.stringify(json.errors)}`);
  }
  return json.response;
}

// --- Response shapes (only the fields we use) ---
export type ApiFixture = {
  fixture: {
    id: number;
    date: string; // ISO 8601 with offset
    venue: { name: string | null };
    status: { short: string; elapsed: number | null };
  };
  league: { id: number; season: number; round: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
  // Score breakdown; `penalty` is populated only for shootout ties.
  score?: { penalty?: { home: number | null; away: number | null } };
};

/** Fixtures for one league/season across a date range. One request. */
export function getFixtures(leagueId: number, season: number, from: string, to: string) {
  return call<ApiFixture[]>("/fixtures", { league: leagueId, season, from, to });
}

/**
 * All currently-live fixtures across every league — a SINGLE request regardless
 * of how many matches are live. This is what keeps live scores free-plan viable.
 */
export function getLiveFixtures() {
  return call<ApiFixture[]>("/fixtures", { live: "all" });
}

export type ApiEvent = {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Penalty" | "Yellow Card" | "Red Card" | ...
  comments: string | null;
};

/**
 * Detailed events (goals w/ scorer + assist, cards, subs) for ONE fixture.
 * Not batchable — one request per match — so callers fetch these lazily after
 * full-time via the budget-capped drain (see poller.runDetailsDrain).
 */
export function getFixtureEvents(fixtureId: number) {
  return call<ApiEvent[]>("/fixtures/events", { fixture: fixtureId });
}

export type ApiLineupPlayer = {
  player: {
    id: number | null;
    name: string | null;
    number: number | null;
    pos: string | null; // "G" | "D" | "M" | "F"
    grid: string | null; // "row:col" for the starting XI, null for subs
  };
};

export type ApiLineup = {
  team: { id: number; name: string };
  formation: string | null;
  coach: { id: number | null; name: string | null };
  startXI: ApiLineupPlayer[];
  substitutes: ApiLineupPlayer[];
};

/** Confirmed lineups (formation, starting XI w/ grid positions, bench) for ONE
 *  fixture. One request per match — fetched lazily alongside events. */
export function getFixtureLineups(fixtureId: number) {
  return call<ApiLineup[]>("/fixtures/lineups", { fixture: fixtureId });
}

export type ApiStandingRow = {
  rank: number;
  team: { id: number; name: string; logo: string | null };
  points: number;
  goalsDiff: number;
  group: string; // "Group A" | "League Phase" | the league name
  form: string | null; // "WWDLW"
  description: string | null; // "Promotion - Champions League", "Relegation", …
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
};

// `/standings` nests the table(s) under league.standings — an array of groups,
// each an array of rows (a plain league has exactly one group).
type ApiStandingsLeague = { league: { id: number; season: number; standings: ApiStandingRow[][] } };

/**
 * Full league/cup table(s) for one league/season — one request. Returns the
 * groups array (one entry for a plain league, several for a group cup). Empty
 * before a competition has played, so callers treat `[]` as "no table yet".
 */
export async function getStandings(leagueId: number, season: number): Promise<ApiStandingRow[][]> {
  const res = await call<ApiStandingsLeague[]>("/standings", { league: leagueId, season });
  return res[0]?.league.standings ?? [];
}
