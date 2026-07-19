import { and, asc, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type {
  Day,
  Match,
  MatchDetail,
  MatchEvent,
  MatchLineups,
  MatchPrediction,
  MatchStatistics,
  MatchStatus,
  Team,
  TeamLineup,
} from "@lucarne/shared";
import { db } from "@/db";
import { competitions, matches, matchEvents, matchLineups, teams } from "@/db/schema";
import { resolveBroadcastersForMatches } from "@/lib/broadcasters";
import { addDays, parisDayKey, parisDayLabel, startOfParisDay } from "@/lib/time";

// Internal schedule types = the shared wire types, except `kickoff` is a Date
// server-side (serialized to an ISO string at the /api boundary via toWire).
export type ScheduleTeam = Team;
export type ScheduleEvent = MatchEvent;
export type ScheduleMatch = Omit<Match, "kickoff"> & { kickoff: Date };
export type ScheduleDay = { key: string; label: string; matches: ScheduleMatch[] };
export type ScheduleMatchDetail = ScheduleMatch & {
  venue: string | null;
  round: string | null;
  referee: string | null;
  lineups: MatchLineups | null;
  statistics: MatchStatistics | null;
  predictions: MatchPrediction | null;
};

/** Serialize to the wire shape (Date → ISO) for a JSON response. */
export function toWire(days: ScheduleDay[]): Day[] {
  return days.map((d) => ({
    ...d,
    matches: d.matches.map((m) => ({ ...m, kickoff: m.kickoff.toISOString() })),
  }));
}

/** Serialize a single detail match (Date → ISO). */
export function toWireMatchDetail(m: ScheduleMatchDetail): MatchDetail {
  return { ...m, kickoff: m.kickoff.toISOString() };
}

export type ScheduleOptions = {
  /** Start of the window (Paris midnight). Defaults to today. */
  from?: Date;
  /** Number of days in the window. Defaults to 8. */
  days?: number;
  /** Restrict to a single competition slug. */
  competition?: string;
};

/**
 * Fetch matches in a Paris-day window, resolve their French broadcasters, and
 * group by day. Optionally restricted to one competition.
 */
export async function getSchedule(opts: ScheduleOptions = {}): Promise<ScheduleDay[]> {
  const start = opts.from ?? startOfParisDay(new Date());
  const end = addDays(start, opts.days ?? 8);

  const home = alias(teams, "home");
  const away = alias(teams, "away");

  const rows = await db
    .select({
      id: matches.id,
      competitionId: matches.competitionId,
      kickoff: matches.kickoff,
      status: matches.status,
      statusShort: matches.statusShort,
      elapsed: matches.elapsed,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      homePenalties: matches.homePenalties,
      awayPenalties: matches.awayPenalties,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      competitionName: competitions.name,
      competitionSlug: competitions.slug,
      homeName: home.name,
      homeShort: home.shortName,
      homeLogo: home.logo,
      awayName: away.name,
      awayShort: away.shortName,
      awayLogo: away.logo,
    })
    .from(matches)
    .innerJoin(competitions, eq(matches.competitionId, competitions.id))
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id))
    .where(
      and(
        gte(matches.kickoff, start),
        lte(matches.kickoff, end),
        opts.competition ? eq(competitions.slug, opts.competition) : undefined,
      ),
    )
    .orderBy(asc(matches.kickoff));

  const broadcastersByMatch = await resolveBroadcastersForMatches(
    rows.map((r) => ({ id: r.id, competitionId: r.competitionId, kickoff: r.kickoff })),
  );

  // Load the events the UI actually renders — goals + cards only (subs/VAR are
  // stored but never shown), and NOT penalty-shootout kicks (the shootout result
  // is carried by home/awayPenalties, so listing each kick as a "goal" is wrong).
  const matchIds = rows.map((r) => r.id);
  const eventRows = matchIds.length
    ? await db
        .select({
          matchId: matchEvents.matchId,
          teamId: matchEvents.teamId,
          type: matchEvents.type,
          detail: matchEvents.detail,
          minute: matchEvents.minute,
          extraMinute: matchEvents.extraMinute,
          player: matchEvents.player,
          assist: matchEvents.assist,
        })
        .from(matchEvents)
        .where(
          and(
            inArray(matchEvents.matchId, matchIds),
            inArray(matchEvents.type, ["Goal", "Card"]),
            or(isNull(matchEvents.comments), ne(matchEvents.comments, "Penalty Shootout")),
          ),
        )
        .orderBy(asc(matchEvents.matchId), asc(matchEvents.sortOrder))
    : [];

  const sides = new Map(rows.map((r) => [r.id, { home: r.homeTeamId, away: r.awayTeamId }]));
  const eventsByMatch = new Map<number, ScheduleEvent[]>();
  for (const e of eventRows) {
    const s = sides.get(e.matchId);
    const side = s ? (e.teamId === s.home ? "home" : e.teamId === s.away ? "away" : null) : null;
    const list = eventsByMatch.get(e.matchId) ?? [];
    list.push({
      type: e.type,
      detail: e.detail,
      minute: e.minute,
      extraMinute: e.extraMinute,
      player: e.player,
      assist: e.assist,
      side,
    });
    eventsByMatch.set(e.matchId, list);
  }

  const days = new Map<string, ScheduleDay>();
  for (const r of rows) {
    const key = parisDayKey(r.kickoff);
    if (!days.has(key)) {
      days.set(key, { key, label: parisDayLabel(r.kickoff), matches: [] });
    }
    days.get(key)!.matches.push({
      id: r.id,
      kickoff: r.kickoff,
      status: r.status as MatchStatus,
      statusShort: r.statusShort,
      elapsed: r.elapsed,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      homePenalties: r.homePenalties,
      awayPenalties: r.awayPenalties,
      competition: { name: r.competitionName, slug: r.competitionSlug },
      home: { name: r.homeName, shortName: r.homeShort, logo: r.homeLogo },
      away: { name: r.awayName, shortName: r.awayShort, logo: r.awayLogo },
      broadcasters: broadcastersByMatch.get(r.id) ?? [],
      events: eventsByMatch.get(r.id) ?? [],
    });
  }

  return [...days.values()];
}

/**
 * Fetch one match by id with the extra detail-page fields (venue, round) plus
 * its resolved broadcasters and goal/card timeline. Returns null if not found.
 */
export async function getMatchDetail(id: number): Promise<ScheduleMatchDetail | null> {
  const home = alias(teams, "home");
  const away = alias(teams, "away");

  const rows = await db
    .select({
      id: matches.id,
      competitionId: matches.competitionId,
      kickoff: matches.kickoff,
      status: matches.status,
      statusShort: matches.statusShort,
      elapsed: matches.elapsed,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      homePenalties: matches.homePenalties,
      awayPenalties: matches.awayPenalties,
      venue: matches.venue,
      round: matches.round,
      referee: matches.referee,
      statistics: matches.statistics,
      predHome: matches.predHome,
      predDraw: matches.predDraw,
      predAway: matches.predAway,
      predAdvice: matches.predAdvice,
      playerRatings: matches.playerRatings,
      homeFormation: matches.homeFormation,
      awayFormation: matches.awayFormation,
      homeCoach: matches.homeCoach,
      awayCoach: matches.awayCoach,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      competitionName: competitions.name,
      competitionSlug: competitions.slug,
      homeName: home.name,
      homeShort: home.shortName,
      homeLogo: home.logo,
      awayName: away.name,
      awayShort: away.shortName,
      awayLogo: away.logo,
    })
    .from(matches)
    .innerJoin(competitions, eq(matches.competitionId, competitions.id))
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id))
    .where(eq(matches.id, id))
    .limit(1);

  const r = rows[0];
  if (!r) return null;

  const broadcastersByMatch = await resolveBroadcastersForMatches([
    { id: r.id, competitionId: r.competitionId, kickoff: r.kickoff },
  ]);

  // Goals + cards only (subs/VAR stored but not shown; shootout kicks excluded —
  // the result is carried by home/awayPenalties).
  const eventRows = await db
    .select({
      teamId: matchEvents.teamId,
      type: matchEvents.type,
      detail: matchEvents.detail,
      minute: matchEvents.minute,
      extraMinute: matchEvents.extraMinute,
      player: matchEvents.player,
      assist: matchEvents.assist,
    })
    .from(matchEvents)
    .where(
      and(
        eq(matchEvents.matchId, r.id),
        inArray(matchEvents.type, ["Goal", "Card"]),
        or(isNull(matchEvents.comments), ne(matchEvents.comments, "Penalty Shootout")),
      ),
    )
    .orderBy(asc(matchEvents.sortOrder));

  const events: ScheduleEvent[] = eventRows.map((e) => ({
    type: e.type,
    detail: e.detail,
    minute: e.minute,
    extraMinute: e.extraMinute,
    player: e.player,
    assist: e.assist,
    side: e.teamId === r.homeTeamId ? "home" : e.teamId === r.awayTeamId ? "away" : null,
  }));

  const lineupRows = await db
    .select({
      teamId: matchLineups.teamId,
      player: matchLineups.player,
      number: matchLineups.number,
      pos: matchLineups.pos,
      grid: matchLineups.grid,
      starter: matchLineups.starter,
    })
    .from(matchLineups)
    .where(eq(matchLineups.matchId, r.id))
    .orderBy(asc(matchLineups.sortOrder));

  let lineups: MatchLineups | null = null;
  if (lineupRows.length > 0) {
    const build = (
      teamId: number,
      formation: string | null,
      coach: string | null,
      side: "home" | "away",
    ): TeamLineup => {
      const forTeam = lineupRows.filter((l) => l.teamId === teamId);
      const ratings = r.playerRatings?.[side];
      const toP = (l: (typeof lineupRows)[number]) => ({
        name: l.player,
        number: l.number,
        pos: l.pos,
        grid: l.grid,
        rating: l.number != null ? (ratings?.[String(l.number)] ?? null) : null,
      });
      return {
        formation,
        coach,
        startXI: forTeam.filter((l) => l.starter).map(toP),
        substitutes: forTeam.filter((l) => !l.starter).map(toP),
      };
    };
    lineups = {
      home: build(r.homeTeamId, r.homeFormation, r.homeCoach, "home"),
      away: build(r.awayTeamId, r.awayFormation, r.awayCoach, "away"),
    };
  }

  return {
    id: r.id,
    kickoff: r.kickoff,
    status: r.status as MatchStatus,
    statusShort: r.statusShort,
    elapsed: r.elapsed,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    homePenalties: r.homePenalties,
    awayPenalties: r.awayPenalties,
    venue: r.venue,
    round: r.round,
    referee: r.referee,
    lineups,
    statistics: r.statistics,
    predictions:
      r.predHome != null && r.predDraw != null && r.predAway != null
        ? { home: r.predHome, draw: r.predDraw, away: r.predAway, advice: r.predAdvice }
        : null,
    competition: { name: r.competitionName, slug: r.competitionSlug },
    home: { name: r.homeName, shortName: r.homeShort, logo: r.homeLogo },
    away: { name: r.awayName, shortName: r.awayShort, logo: r.awayLogo },
    broadcasters: broadcastersByMatch.get(r.id) ?? [],
    events,
  };
}
