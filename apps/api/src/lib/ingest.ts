import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { competitions, teams, matches, matchEvents } from "@/db/schema";
import {
  getFixtures,
  getFixtureEvents,
  getLiveFixtures,
  type ApiFixture,
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
export async function storeMatchEvents(m: DrainMatch): Promise<number> {
  const events = await getFixtureEvents(m.apiFootballId); // 1 API request

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
