import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { TeamStats, TopPlayerEntry } from "@lucarne/shared";
import { db } from "@/db";
import { chunkRows } from "@/lib/d1";
import { competitions, teams, matches, matchEvents, matchLineups, standings, topPlayers } from "@/db/schema";
import {
  getFixtures,
  getFixtureById,
  getFixtureEvents,
  getFixtureLineups,
  getFixturePlayers,
  getFixtureStatistics,
  getLiveFixtures,
  getPredictions,
  getStandings,
  getTopAssists,
  getTopScorers,
  type ApiTopPlayer,
  type ApiFixture,
  type ApiTeamStatistics,
} from "@/lib/api-football";
import { COMPETITIONS, TRACKED_LEAGUE_IDS, currentSeason } from "@/lib/competitions";
import { MATCH_DURATION_MS } from "@/lib/live";
import { normalizeStatus } from "@/lib/status";
import { ymd, addDays } from "@/lib/time";

/** Map API-Football league id -> our internal competition id. */
async function competitionIdMap(): Promise<Map<number, number>> {
  const rows = await db.select().from(competitions);
  return new Map(rows.map((c) => [c.apiFootballId, c.id]));
}

/**
 * Upsert every team referenced by the fixtures in ONE statement, return
 * apiId -> internal id. Batched to stay within the Workers subrequest limit.
 */
async function upsertTeams(fixtures: ApiFixture[]): Promise<Map<number, number>> {
  const seen = new Map<number, { apiFootballId: number; name: string; logo: string }>();
  for (const f of fixtures) {
    seen.set(f.teams.home.id, { apiFootballId: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo });
    seen.set(f.teams.away.id, { apiFootballId: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo });
  }
  if (seen.size === 0) return new Map();

  // 3 bound columns per row → chunked so the statement stays under D1's ceiling.
  const out = new Map<number, number>();
  for (const part of chunkRows([...seen.values()], 3)) {
    const returned = await db
      .insert(teams)
      .values(part)
      .onConflictDoUpdate({
        target: teams.apiFootballId,
        set: { name: sql`excluded.name`, logo: sql`excluded.logo` },
      })
      .returning({ id: teams.id, apiFootballId: teams.apiFootballId });
    for (const r of returned) out.set(r.apiFootballId, r.id);
  }
  return out;
}

export type SyncResult = {
  competitions: number;
  fixtures: number;
  requestsUsed: number;
  /** How many competitions threw — surfaced so a partial sync isn't read as clean. */
  failed?: number;
};

/** Upsert a batch of fixtures (teams + matches) in batched statements. */
export async function upsertFixtures(all: ApiFixture[]): Promise<number> {
  if (all.length === 0) return 0;

  const compMap = await competitionIdMap();
  // A fresh D1 has no competitions until POST /api/admin/seed runs. Without this
  // every fixture would be silently dropped below and the sync would report
  // "0 fixtures, ok" — then not consider itself due again for 25 hours, serving
  // an empty schedule for a day. Fail loudly so the job is retried instead.
  if (compMap.size === 0) {
    throw new Error("no competitions in the database — run the reference-data seed first");
  }
  const teamMap = await upsertTeams(all);

  const rows = all
    .map((f) => {
      const competitionId = compMap.get(f.league.id);
      const homeTeamId = teamMap.get(f.teams.home.id);
      const awayTeamId = teamMap.get(f.teams.away.id);
      if (!competitionId || !homeTeamId || !awayTeamId) return null;
      return {
        apiFootballId: f.fixture.id,
        competitionId,
        season: f.league.season,
        round: f.league.round,
        kickoff: new Date(f.fixture.date),
        statusShort: f.fixture.status.short,
        status: normalizeStatus(f.fixture.status.short),
        elapsed: f.fixture.status.elapsed,
        homeTeamId,
        awayTeamId,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        homePenalties: f.score?.penalty?.home ?? null,
        awayPenalties: f.score?.penalty?.away ?? null,
        venue: f.fixture.venue.name,
        referee: f.fixture.referee,
        updatedAt: new Date(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // 17 bound columns per row: a full-season resync is ~37,000 parameters in one
  // statement on D1 without this split.
  for (const part of chunkRows(rows, 17)) {
    await db
      .insert(matches)
      .values(part)
      .onConflictDoUpdate({
        target: matches.apiFootballId,
        set: {
          kickoff: sql`excluded.kickoff`,
          round: sql`excluded.round`,
          statusShort: sql`excluded.status_short`,
          status: sql`excluded.status`,
          elapsed: sql`excluded.elapsed`,
          homeGoals: sql`excluded.home_goals`,
          awayGoals: sql`excluded.away_goals`,
          homePenalties: sql`excluded.home_penalties`,
          awayPenalties: sql`excluded.away_penalties`,
          venue: sql`excluded.venue`,
          referee: sql`excluded.referee`,
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}

/**
 * Daily fixture sync. One API request per competition. Teams and matches are
 * each upserted in a single batched statement.
 */
export async function syncFixtures(daysAhead = 14, daysBack = 3): Promise<SyncResult> {
  const now = new Date();
  // Look back a few days too, so recently-finished games get their final
  // scores/status captured (not just upcoming fixtures).
  const from = ymd(addDays(now, -daysBack));
  const to = ymd(addDays(now, daysAhead));

  // Dedup fixtures by id (defensive — shouldn't happen across leagues).
  const byId = new Map<number, ApiFixture>();
  let requestsUsed = 0;
  for (const comp of COMPETITIONS) {
    // Per-competition season (e.g. World Cup = 2026, club leagues = 2025).
    const fixtures = await getFixtures(comp.apiFootballId, comp.season ?? currentSeason(), from, to);
    requestsUsed += 1;
    for (const f of fixtures) byId.set(f.fixture.id, f);
  }

  const fixtures = await upsertFixtures([...byId.values()]);
  return { competitions: COMPETITIONS.length, fixtures, requestsUsed };
}

/**
 * Fetch + store the full table(s) for one competition/season — one API request.
 * Replaces the competition's rows wholesale (idempotent). An empty response
 * (nothing published yet, e.g. pre-season) leaves any existing table untouched.
 * Returns the number of rows stored.
 */
export async function storeStandings(
  competitionId: number,
  apiLeagueId: number,
  season: number,
): Promise<number> {
  const groups = await getStandings(apiLeagueId, season); // 1 API request
  const flat = groups.flat();
  if (flat.length === 0) return 0;

  // Every listed team must exist (a few may never have appeared in a fixture).
  const teamSeen = new Map<number, { apiFootballId: number; name: string; logo: string | null }>();
  for (const r of flat) {
    teamSeen.set(r.team.id, { apiFootballId: r.team.id, name: r.team.name, logo: r.team.logo });
  }
  // 3 columns per row, and a Champions League phase table is 36 teams (108
  // parameters) — over D1's ceiling without the split.
  const teamMap = new Map<number, number>();
  for (const part of chunkRows([...teamSeen.values()], 3)) {
    const returned = await db
      .insert(teams)
      .values(part)
      .onConflictDoUpdate({
        target: teams.apiFootballId,
        set: { name: sql`excluded.name`, logo: sql`excluded.logo` },
      })
      .returning({ id: teams.id, apiFootballId: teams.apiFootballId });
    for (const t of returned) teamMap.set(t.apiFootballId, t.id);
  }

  let order = 0;
  const rows = groups.flatMap((group) =>
    group
      .map((r) => {
        const teamId = teamMap.get(r.team.id);
        if (!teamId) return null;
        return {
          competitionId,
          season,
          groupLabel: r.group || null,
          rank: r.rank,
          teamId,
          played: r.all.played,
          win: r.all.win,
          draw: r.all.draw,
          lose: r.all.lose,
          goalsFor: r.all.goals.for,
          goalsAgainst: r.all.goals.against,
          goalsDiff: r.goalsDiff,
          points: r.points,
          form: r.form,
          description: r.description,
          sortOrder: order++,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );

  const [tableMark] = await db
    .select({ id: sql<number>`coalesce(max(${standings.id}), 0)` })
    .from(standings)
    .where(and(eq(standings.competitionId, competitionId), eq(standings.season, season)));
  const tableWatermark = tableMark?.id ?? 0;
  const scope = and(eq(standings.competitionId, competitionId), eq(standings.season, season));

  // Insert-then-drop (see storeMatchEvents): a 20-row table is 320 bound
  // parameters, and a failed rewrite must not leave the league table empty.
  try {
    for (const part of chunkRows(rows, 16)) await db.insert(standings).values(part);
  } catch (err) {
    await db.delete(standings).where(and(scope, gt(standings.id, tableWatermark)));
    throw err;
  }
  await db.delete(standings).where(and(scope, lte(standings.id, tableWatermark)));
  return rows.length;
}

/** Refresh the table(s) for every tracked competition (one request each). */
export async function syncAllStandings(): Promise<{
  competitions: number;
  rows: number;
  requestsUsed: number;
  failed: number;
}> {
  const compMap = await competitionIdMap();
  let rows = 0;
  let requestsUsed = 0;
  let failed = 0;
  for (const comp of COMPETITIONS) {
    const competitionId = compMap.get(comp.apiFootballId);
    if (!competitionId) continue;
    try {
      rows += await storeStandings(competitionId, comp.apiFootballId, comp.season ?? currentSeason());
    } catch (err) {
      failed += 1;
      console.error("[standings]", comp.slug, err);
    }
    requestsUsed += 1;
  }
  // Don't let a total wipe-out pass as a successful daily sync.
  if (requestsUsed > 0 && failed === requestsUsed) {
    throw new Error(`standings failed for all ${failed} competitions`);
  }
  return { competitions: COMPETITIONS.length, rows, requestsUsed, failed };
}

const TOP_PLAYERS_N = 20;

function parseTopPlayers(rows: ApiTopPlayer[], kind: "scorers" | "assists"): TopPlayerEntry[] {
  return rows.slice(0, TOP_PLAYERS_N).map((r, i) => {
    const st = r.statistics[0];
    const value = (kind === "scorers" ? st?.goals.total : st?.goals.assists) ?? 0;
    return { rank: i + 1, player: r.player.name, team: st?.team.name ?? "", value };
  });
}

/** Refresh the top-scorers + top-assists rankings for every tracked competition
 *  (2 requests each). Folded into the daily sync alongside standings. */
export async function syncAllTopPlayers(): Promise<{ competitions: number; requestsUsed: number }> {
  const compMap = await competitionIdMap();
  let requestsUsed = 0;
  for (const comp of COMPETITIONS) {
    const competitionId = compMap.get(comp.apiFootballId);
    if (!competitionId) continue;
    const season = comp.season ?? currentSeason();
    try {
      const scorers = parseTopPlayers(await getTopScorers(comp.apiFootballId, season), "scorers");
      const assists = parseTopPlayers(await getTopAssists(comp.apiFootballId, season), "assists");
      for (const [kind, entries] of [
        ["scorers", scorers],
        ["assists", assists],
      ] as const) {
        await db
          .insert(topPlayers)
          .values({ competitionId, season, kind, entries, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [topPlayers.competitionId, topPlayers.season, topPlayers.kind],
            set: { entries, updatedAt: new Date() },
          });
      }
    } catch (err) {
      console.error("[topplayers]", comp.slug, err);
    }
    requestsUsed += 2;
  }
  return { competitions: COMPETITIONS.length, requestsUsed };
}

/** Backfill one competition over an explicit date range (e.g. a whole tournament). */
export async function backfillFixtures(
  leagueId: number,
  season: number,
  from: string,
  to: string,
): Promise<number> {
  return upsertFixtures(await getFixtures(leagueId, season, from, to));
}

/**
 * Apply a single live snapshot. `fixtures?live=all` returns EVERY live match
 * globally in one request; we filter to our tracked leagues (keeps the update
 * count tiny + well under the Workers subrequest limit) then update scores.
 */
/** Write one fixture's live state (status/score/elapsed/pens) onto its match. */
function liveSet(f: ApiFixture) {
  return {
    statusShort: f.fixture.status.short,
    status: normalizeStatus(f.fixture.status.short),
    elapsed: f.fixture.status.elapsed,
    homeGoals: f.goals.home,
    awayGoals: f.goals.away,
    homePenalties: f.score?.penalty?.home ?? null,
    awayPenalties: f.score?.penalty?.away ?? null,
    updatedAt: new Date(),
  };
}

/**
 * Pull the `live=all` snapshot and patch every tracked live match. Then FINALISE
 * stragglers: a match that's still `live` in our DB but is no longer in the live
 * snapshot has just finished (or been suspended) — `live=all` drops it, so
 * nothing else would ever flip it off "live". We fetch its authoritative final
 * state by id (1 request each, rare) and write it, which also lets the drain
 * pick it up and the full-time push fire. Returns the extra requests spent.
 */
export async function applyLiveUpdate(): Promise<{
  updated: number;
  finalized: number;
  requests: number;
}> {
  const live = (await getLiveFixtures()).filter((f) => TRACKED_LEAGUE_IDS.has(f.league.id));
  const liveIds = new Set(live.map((f) => f.fixture.id));

  let updated = 0;
  for (const f of live) {
    const res = await db
      .update(matches)
      .set(liveSet(f))
      .where(eq(matches.apiFootballId, f.fixture.id))
      .returning({ id: matches.id });
    updated += res.length;
  }

  // DB matches still marked "live" but absent from the snapshot → they ended.
  const nowMs = Date.now();
  const stuckCeiling = nowMs - MATCH_DURATION_MS; // past this a still-"live" row is definitively over
  const stillLive = await db
    .select({ id: matches.id, apiFootballId: matches.apiFootballId, kickoff: matches.kickoff })
    .from(matches)
    .where(and(eq(matches.status, "live"), lte(matches.kickoff, new Date(nowMs))))
    .limit(12);
  const dropped = stillLive.filter((m) => !liveIds.has(m.apiFootballId));

  let finalized = 0;
  let requests = 1; // the live=all call
  for (const m of dropped) {
    const [f] = await getFixtureById(m.apiFootballId); // 1 request, authoritative
    requests++;
    if (f && normalizeStatus(f.fixture.status.short) !== "live") {
      await db.update(matches).set(liveSet(f)).where(eq(matches.id, m.id));
      finalized++;
      continue;
    }
    // No authoritative finish (fixture gone, or the API is itself stale and still
    // says "live"). If it's already past the longest possible match it has surely
    // ended — force it finished from the last-known score so it stops showing as
    // live and stops being re-polled. Recent drops are left for a retry next tick.
    if (m.kickoff.getTime() <= stuckCeiling) {
      await db
        .update(matches)
        .set({ status: "finished", statusShort: "FT", elapsed: null })
        .where(eq(matches.id, m.id));
      finalized++;
    }
  }

  return { updated, finalized, requests };
}

/** A finished match ready for its post-match details fetch. */
export type DrainMatch = {
  id: number;
  apiFootballId: number;
  homeTeamId: number;
  homeApiId: number;
  awayTeamId: number;
  awayApiId: number;
};

/**
 * Fetch + store the detailed events (goals, cards, subs) for one finished match,
 * then stamp `detailsFetchedAt`. Costs ONE API request. Idempotent: replaces any
 * existing events for the match. Returns the number of events stored.
 */
/**
 * Options shared by the per-match detail stores.
 *  - `stamp`: write the `*FetchedAt` marker. `false` = live enrichment — store the
 *    running snapshot but leave it un-stamped so the post-match drain still does
 *    the final authoritative fetch at full-time.
 *  - `stampWhenEmpty`: when the API returns nothing, stamp anyway (the nightly
 *    drain giving up) vs leave un-stamped for a retry (eager drain / live).
 */
type StoreOpts = { stamp?: boolean; stampWhenEmpty?: boolean };

export async function storeMatchEvents(
  m: DrainMatch,
  { stamp = true, stampWhenEmpty = true }: StoreOpts = {},
): Promise<number> {
  const events = await getFixtureEvents(m.apiFootballId); // 1 API request

  // Nothing to store yet: leave the DB untouched so the previous snapshot stands
  // and a later tick retries (pre-match eager drain, or a live blip returning []).
  if (events.length === 0 && !stampWhenEmpty) return 0;

  const teamMap = new Map<number, number>([
    [m.homeApiId, m.homeTeamId],
    [m.awayApiId, m.awayTeamId],
  ]);

  // Write the new rows BEFORE dropping the old ones. D1 has no transactions, so a
  // delete-then-insert that fails half way leaves the match showing zero events —
  // and since the drain only stamps on success, it would just repeat. Old rows are
  // identified by an id watermark taken first; if a chunk fails we remove what we
  // wrote and rethrow, leaving the previous snapshot untouched.
  const [mark] = await db
    .select({ id: sql<number>`coalesce(max(${matchEvents.id}), 0)` })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, m.id));
  const watermark = mark?.id ?? 0;

  const rows = events.map((e, i) => ({
    matchId: m.id,
    teamId: teamMap.get(e.team.id) ?? null,
    minute: e.time.elapsed,
    extraMinute: e.time.extra,
    type: e.type,
    detail: e.detail,
    player: e.player?.name ?? null,
    assist: e.assist?.name ?? null,
    comments: e.comments ?? null,
    sortOrder: i,
  }));

  try {
    for (const part of chunkRows(rows, 10)) await db.insert(matchEvents).values(part);
  } catch (err) {
    await db
      .delete(matchEvents)
      .where(and(eq(matchEvents.matchId, m.id), gt(matchEvents.id, watermark)));
    throw err;
  }
  await db
    .delete(matchEvents)
    .where(and(eq(matchEvents.matchId, m.id), lte(matchEvents.id, watermark)));

  // Live enrichment (stamp:false) stores the running snapshot without stamping, so
  // the post-match drain still does the final authoritative fetch at full-time.
  if (stamp) await db.update(matches).set({ detailsFetchedAt: new Date() }).where(eq(matches.id, m.id));
  return events.length;
}

/**
 * Fetch + store the confirmed lineups (formation, coach, starting XI w/ grid
 * positions, bench) for one match, then stamp `lineupsFetchedAt`. Costs ONE API
 * request. Idempotent: replaces any existing lineup rows for the match.
 *
 * Lineups only publish ~40 min before kickoff, so `stampWhenEmpty: false` (the
 * pre-match poll) leaves an empty response un-stamped so a later tick retries;
 * the post-match drain stamps regardless (a finished game with no lineup data
 * shouldn't be chased forever).
 */
export async function storeMatchLineups(
  m: DrainMatch,
  { stampWhenEmpty = true }: { stampWhenEmpty?: boolean } = {},
): Promise<number> {
  const lineups = await getFixtureLineups(m.apiFootballId); // 1 API request

  const teamMap = new Map<number, number>([
    [m.homeApiId, m.homeTeamId],
    [m.awayApiId, m.awayTeamId],
  ]);

  const rows: (typeof matchLineups.$inferInsert)[] = [];
  const formation: Record<"home" | "away", string | null> = { home: null, away: null };
  const coach: Record<"home" | "away", string | null> = { home: null, away: null };

  for (const lu of lineups) {
    const teamId = teamMap.get(lu.team.id);
    if (!teamId) continue;
    const side = lu.team.id === m.homeApiId ? "home" : "away";
    formation[side] = lu.formation;
    coach[side] = lu.coach?.name ?? null;
    let order = 0;
    const push = (p: (typeof lu.startXI)[number], starter: boolean) =>
      rows.push({
        matchId: m.id,
        teamId,
        player: p.player.name ?? "",
        number: p.player.number,
        pos: p.player.pos,
        grid: p.player.grid,
        starter,
        sortOrder: order++,
      });
    for (const p of lu.startXI) push(p, true);
    for (const p of lu.substitutes) push(p, false);
  }

  // Not published yet (pre-match): don't touch the DB, so a later tick retries.
  if (rows.length === 0 && !stampWhenEmpty) return 0;

  // Insert-then-drop with an id watermark (see storeMatchEvents): a 52-row lineup
  // is 416 bound parameters, and a failed rewrite must not blank the pitch.
  const [lineupMark] = await db
    .select({ id: sql<number>`coalesce(max(${matchLineups.id}), 0)` })
    .from(matchLineups)
    .where(eq(matchLineups.matchId, m.id));
  const lineupWatermark = lineupMark?.id ?? 0;
  try {
    for (const part of chunkRows(rows, 8)) await db.insert(matchLineups).values(part);
  } catch (err) {
    await db
      .delete(matchLineups)
      .where(and(eq(matchLineups.matchId, m.id), gt(matchLineups.id, lineupWatermark)));
    throw err;
  }
  await db
    .delete(matchLineups)
    .where(and(eq(matchLineups.matchId, m.id), lte(matchLineups.id, lineupWatermark)));

  await db
    .update(matches)
    .set({
      homeFormation: formation.home,
      awayFormation: formation.away,
      homeCoach: coach.home,
      awayCoach: coach.away,
      lineupsFetchedAt: new Date(),
    })
    .where(eq(matches.id, m.id));

  return rows.length;
}

/** Normalise API-Football's stat list into our curated TeamStats (nulls kept). */
function normalizeStats(stats: ApiTeamStatistics["statistics"]): TeamStats {
  const get = (type: string): number | null => {
    const s = stats.find((x) => x.type === type);
    if (s == null || s.value == null) return null;
    const n = typeof s.value === "number" ? s.value : parseFloat(String(s.value).replace("%", ""));
    return Number.isFinite(n) ? n : null;
  };
  // Pass accuracy: the API only sends the pre-computed "Passes %" for some
  // fixtures (and often only after full-time). When it's missing but the raw
  // counts are present — as they are live — derive it so it shows during the
  // match instead of staying blank. (xG has no such fallback: no live components.)
  const acc = get("Passes accurate");
  const total = get("Total passes");
  const passAccuracy =
    get("Passes %") ?? (acc != null && total ? Math.round((acc / total) * 100) : null);

  return {
    possession: get("Ball Possession"),
    shots: get("Total Shots"),
    shotsOnTarget: get("Shots on Goal"),
    shotsOffTarget: get("Shots off Goal"),
    blockedShots: get("Blocked Shots"),
    shotsInsideBox: get("Shots insidebox"),
    shotsOutsideBox: get("Shots outsidebox"),
    xg: get("expected_goals"),
    corners: get("Corner Kicks"),
    fouls: get("Fouls"),
    offsides: get("Offsides"),
    saves: get("Goalkeeper Saves"),
    goalsPrevented: get("goals_prevented"),
    passAccuracy,
    yellowCards: get("Yellow Cards"),
    redCards: get("Red Cards"),
  };
}

/**
 * Fetch + store team match statistics (possession, shots, xG, …) for one match,
 * then stamp `statsFetchedAt`. Costs ONE API request. Stores null when the API
 * has no stats for both teams (common for minor fixtures); returns the number of
 * non-null stat values captured. Stats settle a few minutes after full-time, so
 * `stampWhenEmpty: false` (the eager drain) leaves an empty response un-stamped
 * for a later retry; the nightly drain stamps regardless.
 */
export async function storeMatchStatistics(
  m: DrainMatch,
  { stamp = true, stampWhenEmpty = true }: StoreOpts = {},
): Promise<number> {
  const teams = await getFixtureStatistics(m.apiFootballId); // 1 API request

  let home: TeamStats | null = null;
  let away: TeamStats | null = null;
  for (const t of teams) {
    if (t.team.id === m.homeApiId) home = normalizeStats(t.statistics);
    else if (t.team.id === m.awayApiId) away = normalizeStats(t.statistics);
  }
  const statistics = home && away ? { home, away } : null;

  if (statistics === null && !stampWhenEmpty) return 0;

  const set: Partial<typeof matches.$inferInsert> = { statistics };
  if (stamp) set.statsFetchedAt = new Date();
  await db.update(matches).set(set).where(eq(matches.id, m.id));

  return statistics
    ? [...Object.values(statistics.home), ...Object.values(statistics.away)].filter((v) => v != null)
        .length
    : 0;
}

/**
 * Fetch + store per-player match ratings for one match as a name→rating map on
 * `matches.playerRatings` (attached to lineups by name at read time), then stamp
 * `ratingsFetchedAt`. Costs ONE API request. Returns the number of rated players.
 * Ratings lag ~10-20 min after full-time, so `stampWhenEmpty: false` (the eager
 * drain) leaves an empty response un-stamped for a later retry; the nightly drain
 * stamps regardless.
 */
export async function storeMatchPlayerRatings(
  m: DrainMatch,
  { stamp = true, stampWhenEmpty = true }: StoreOpts = {},
): Promise<number> {
  const teams = await getFixturePlayers(m.apiFootballId); // 1 API request

  const byNumber = { home: {} as Record<string, number>, away: {} as Record<string, number> };
  let motm: { name: string; side: "home" | "away"; rating: number } | null = null;
  for (const t of teams) {
    const side = t.team.id === m.homeApiId ? "home" : t.team.id === m.awayApiId ? "away" : null;
    if (!side) continue;
    for (const p of t.players) {
      const g = p.statistics[0]?.games;
      const r = g?.rating != null ? parseFloat(g.rating) : NaN;
      // 0 (or negative) means "no real rating" — unused subs, or ratings not yet
      // computed — so treat it as absent: don't store it, don't pick it as MOTM.
      if (!Number.isFinite(r) || r <= 0) continue;
      if (g?.number != null) byNumber[side][String(g.number)] = r;
      if (!motm || r > motm.rating) motm = { name: p.player.name, side, rating: r };
    }
  }
  const count = Object.keys(byNumber.home).length + Object.keys(byNumber.away).length;
  const playerRatings = count > 0 ? byNumber : null;

  if (playerRatings === null && !stampWhenEmpty) return 0;

  const set: Partial<typeof matches.$inferInsert> = { playerRatings };
  if (motm) {
    set.motmName = motm.name;
    set.motmSide = motm.side;
    set.motmRating = motm.rating;
  }
  if (stamp) set.ratingsFetchedAt = new Date();
  await db
    .update(matches)
    .set(set)
    .where(eq(matches.id, m.id));

  return count;
}

/** Fetch + store the pre-match prediction (win %, advice) for ONE match. Costs
 *  one API request; fetched once before kickoff. Returns 1 if a prediction landed. */
export async function storeMatchPredictions(
  m: { id: number; apiFootballId: number },
  { stampWhenEmpty = true }: StoreOpts = {},
): Promise<number> {
  const [p] = await getPredictions(m.apiFootballId); // 1 API request
  const pct = (s: string | null | undefined) => {
    const n = s ? Number.parseInt(s, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const predHome = pct(p?.predictions.percent.home);
  const predDraw = pct(p?.predictions.percent.draw);
  const predAway = pct(p?.predictions.percent.away);
  const predAdvice = p?.predictions.advice ?? null;
  const hasData = predHome != null || predDraw != null || predAway != null || predAdvice != null;

  if (!hasData && !stampWhenEmpty) return 0;

  await db
    .update(matches)
    .set({ predHome, predDraw, predAway, predAdvice, predictionsFetchedAt: new Date() })
    .where(eq(matches.id, m.id));

  return hasData ? 1 : 0;
}
