import { and, eq, sql } from "drizzle-orm";
import type { TeamStats } from "@lucarne/shared";
import { db } from "@/db";
import { competitions, teams, matches, matchEvents, matchLineups, standings } from "@/db/schema";
import {
  getFixtures,
  getFixtureEvents,
  getFixtureLineups,
  getFixturePlayers,
  getFixtureStatistics,
  getLiveFixtures,
  getStandings,
  type ApiFixture,
  type ApiTeamStatistics,
} from "@/lib/api-football";
import { COMPETITIONS, TRACKED_LEAGUE_IDS, currentSeason } from "@/lib/competitions";
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

  const returned = await db
    .insert(teams)
    .values([...seen.values()])
    .onConflictDoUpdate({
      target: teams.apiFootballId,
      set: { name: sql`excluded.name`, logo: sql`excluded.logo` },
    })
    .returning({ id: teams.id, apiFootballId: teams.apiFootballId });

  return new Map(returned.map((r) => [r.apiFootballId, r.id]));
}

export type SyncResult = {
  competitions: number;
  fixtures: number;
  requestsUsed: number;
};

/** Upsert a batch of fixtures (teams + matches) in batched statements. */
export async function upsertFixtures(all: ApiFixture[]): Promise<number> {
  if (all.length === 0) return 0;

  const compMap = await competitionIdMap();
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

  if (rows.length > 0) {
    await db
      .insert(matches)
      .values(rows)
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
          updatedAt: sql`(unixepoch() * 1000)`,
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
  const returned = await db
    .insert(teams)
    .values([...teamSeen.values()])
    .onConflictDoUpdate({
      target: teams.apiFootballId,
      set: { name: sql`excluded.name`, logo: sql`excluded.logo` },
    })
    .returning({ id: teams.id, apiFootballId: teams.apiFootballId });
  const teamMap = new Map(returned.map((t) => [t.apiFootballId, t.id]));

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

  await db
    .delete(standings)
    .where(and(eq(standings.competitionId, competitionId), eq(standings.season, season)));
  if (rows.length > 0) await db.insert(standings).values(rows);
  return rows.length;
}

/** Refresh the table(s) for every tracked competition (one request each). */
export async function syncAllStandings(): Promise<{
  competitions: number;
  rows: number;
  requestsUsed: number;
}> {
  const compMap = await competitionIdMap();
  let rows = 0;
  let requestsUsed = 0;
  for (const comp of COMPETITIONS) {
    const competitionId = compMap.get(comp.apiFootballId);
    if (!competitionId) continue;
    try {
      rows += await storeStandings(competitionId, comp.apiFootballId, comp.season ?? currentSeason());
    } catch (err) {
      console.error("[standings]", comp.slug, err);
    }
    requestsUsed += 1;
  }
  return { competitions: COMPETITIONS.length, rows, requestsUsed };
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
export async function applyLiveUpdate(): Promise<{ updated: number }> {
  const live = (await getLiveFixtures()).filter((f) => TRACKED_LEAGUE_IDS.has(f.league.id));
  let updated = 0;
  for (const f of live) {
    const res = await db
      .update(matches)
      .set({
        statusShort: f.fixture.status.short,
        status: normalizeStatus(f.fixture.status.short),
        elapsed: f.fixture.status.elapsed,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        homePenalties: f.score?.penalty?.home ?? null,
        awayPenalties: f.score?.penalty?.away ?? null,
        updatedAt: new Date(),
      })
      .where(eq(matches.apiFootballId, f.fixture.id))
      .returning({ id: matches.id });
    updated += res.length;
  }
  return { updated };
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
export async function storeMatchEvents(
  m: DrainMatch,
  { stampWhenEmpty = true }: { stampWhenEmpty?: boolean } = {},
): Promise<number> {
  const events = await getFixtureEvents(m.apiFootballId); // 1 API request

  // Not published yet (match just kicked off / still settling): leave the row
  // un-stamped so the eager drain retries; the nightly drain stamps regardless.
  if (events.length === 0 && !stampWhenEmpty) return 0;

  const teamMap = new Map<number, number>([
    [m.homeApiId, m.homeTeamId],
    [m.awayApiId, m.awayTeamId],
  ]);

  await db.delete(matchEvents).where(eq(matchEvents.matchId, m.id));

  if (events.length > 0) {
    await db.insert(matchEvents).values(
      events.map((e, i) => ({
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
      })),
    );
  }

  await db.update(matches).set({ detailsFetchedAt: new Date() }).where(eq(matches.id, m.id));
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

  await db.delete(matchLineups).where(eq(matchLineups.matchId, m.id));
  if (rows.length > 0) await db.insert(matchLineups).values(rows);

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
  return {
    possession: get("Ball Possession"),
    shots: get("Total Shots"),
    shotsOnTarget: get("Shots on Goal"),
    xg: get("expected_goals"),
    corners: get("Corner Kicks"),
    fouls: get("Fouls"),
    offsides: get("Offsides"),
    saves: get("Goalkeeper Saves"),
    passAccuracy: get("Passes %"),
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
  { stampWhenEmpty = true }: { stampWhenEmpty?: boolean } = {},
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

  await db.update(matches).set({ statistics, statsFetchedAt: new Date() }).where(eq(matches.id, m.id));

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
  { stampWhenEmpty = true }: { stampWhenEmpty?: boolean } = {},
): Promise<number> {
  const teams = await getFixturePlayers(m.apiFootballId); // 1 API request

  const byNumber = { home: {} as Record<string, number>, away: {} as Record<string, number> };
  for (const t of teams) {
    const side = t.team.id === m.homeApiId ? "home" : t.team.id === m.awayApiId ? "away" : null;
    if (!side) continue;
    for (const p of t.players) {
      const g = p.statistics[0]?.games;
      const r = g?.rating != null ? parseFloat(g.rating) : NaN;
      if (Number.isFinite(r) && g?.number != null) byNumber[side][String(g.number)] = r;
    }
  }
  const count = Object.keys(byNumber.home).length + Object.keys(byNumber.away).length;
  const playerRatings = count > 0 ? byNumber : null;

  if (playerRatings === null && !stampWhenEmpty) return 0;

  await db
    .update(matches)
    .set({ playerRatings, ratingsFetchedAt: new Date() })
    .where(eq(matches.id, m.id));

  return count;
}
