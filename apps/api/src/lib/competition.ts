import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  BracketMatch,
  BracketRound,
  CompetitionDetail,
  MatchStatus,
  StandingGroup,
  StandingRow,
} from "@lucarne/shared";
import { db } from "@/db";
import { competitions, matches, standings, teams, topPlayers } from "@/db/schema";
import { COMPETITIONS, currentSeason } from "@/lib/competitions";

/** The season we track a competition at (World Cup keeps its override). */
function seasonFor(slug: string): number {
  return COMPETITIONS.find((c) => c.slug === slug)?.season ?? currentSeason();
}

/**
 * Rank a round name within a knockout bracket, or null if it isn't a knockout
 * round (group/league phase, qualifiers). Lower = earlier column. The Final
 * sorts last (rightmost); the 3rd-place match sits just before it. Tests run in
 * array order so "3rd Place Final" is caught before the bare /final/.
 */
function knockoutRank(round: string | null): number | null {
  if (!round) return null;
  const r = round.toLowerCase();
  if (/group|league stage|regular season|qualifying|preliminary/.test(r)) return null;
  const table: [RegExp, number][] = [
    [/play-?off/, 1],
    [/round of 128/, 2],
    [/round of 64/, 3],
    [/round of 32/, 4],
    [/round of 16|8th final/, 5],
    [/quarter/, 6],
    [/semi/, 7],
    [/3rd place|third place/, 8],
    [/final/, 9],
  ];
  for (const [re, rank] of table) if (re.test(r)) return rank;
  return null;
}

function winnerOf(m: {
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
}): "home" | "away" | null {
  if (m.status !== "finished") return null;
  const { homePenalties: hp, awayPenalties: ap, homeGoals: hg, awayGoals: ag } = m;
  if (hp != null && ap != null && hp !== ap) return hp > ap ? "home" : "away";
  if (hg != null && ag != null && hg !== ag) return hg > ag ? "home" : "away";
  return null;
}

/** Group the stored table rows by group label, preserving API order (sortOrder). */
async function loadStandings(competitionId: number, season: number): Promise<StandingGroup[]> {
  const rows = await db
    .select({
      groupLabel: standings.groupLabel,
      rank: standings.rank,
      played: standings.played,
      win: standings.win,
      draw: standings.draw,
      lose: standings.lose,
      goalsFor: standings.goalsFor,
      goalsAgainst: standings.goalsAgainst,
      goalsDiff: standings.goalsDiff,
      points: standings.points,
      form: standings.form,
      description: standings.description,
      teamName: teams.name,
      teamShort: teams.shortName,
      teamLogo: teams.logo,
    })
    .from(standings)
    .innerJoin(teams, eq(standings.teamId, teams.id))
    .where(and(eq(standings.competitionId, competitionId), eq(standings.season, season)))
    .orderBy(asc(standings.sortOrder));

  const groups = new Map<string, StandingRow[]>();
  for (const r of rows) {
    const label = r.groupLabel || "Overall";
    const row: StandingRow = {
      rank: r.rank,
      team: { name: r.teamName, shortName: r.teamShort, logo: r.teamLogo },
      played: r.played,
      win: r.win,
      draw: r.draw,
      lose: r.lose,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalsDiff: r.goalsDiff,
      points: r.points,
      form: r.form,
      description: r.description,
    };
    (groups.get(label) ?? groups.set(label, []).get(label)!).push(row);
  }
  return [...groups.entries()].map(([label, rows]) => ({ label, rows }));
}

/** Build the knockout bracket (one column per round) from stored fixtures. */
async function loadBracket(competitionId: number, season: number): Promise<BracketRound[]> {
  const home = alias(teams, "home");
  const away = alias(teams, "away");

  const rows = await db
    .select({
      id: matches.id,
      round: matches.round,
      kickoff: matches.kickoff,
      status: matches.status,
      homeGoals: matches.homeGoals,
      awayGoals: matches.awayGoals,
      homePenalties: matches.homePenalties,
      awayPenalties: matches.awayPenalties,
      homeName: home.name,
      homeShort: home.shortName,
      homeLogo: home.logo,
      awayName: away.name,
      awayShort: away.shortName,
      awayLogo: away.logo,
    })
    .from(matches)
    .innerJoin(home, eq(matches.homeTeamId, home.id))
    .innerJoin(away, eq(matches.awayTeamId, away.id))
    .where(and(eq(matches.competitionId, competitionId), eq(matches.season, season)))
    .orderBy(asc(matches.kickoff));

  // Bucket by round, keeping only knockout rounds.
  const byRound = new Map<string, { rank: number; matches: BracketMatch[] }>();
  for (const r of rows) {
    const rank = knockoutRank(r.round);
    if (rank == null || !r.round) continue;
    const bucket = byRound.get(r.round) ?? { rank, matches: [] };
    bucket.matches.push({
      id: r.id,
      kickoff: r.kickoff.toISOString(),
      status: r.status as MatchStatus,
      home: { name: r.homeName, shortName: r.homeShort, logo: r.homeLogo },
      away: { name: r.awayName, shortName: r.awayShort, logo: r.awayLogo },
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      homePenalties: r.homePenalties,
      awayPenalties: r.awayPenalties,
      winner: winnerOf(r),
    });
    byRound.set(r.round, bucket);
  }

  return [...byRound.entries()]
    .sort((a, b) => a[1].rank - b[1].rank)
    .map(([name, b]) => ({ name, matches: b.matches }));
}

/**
 * Assemble a competition's page payload: its table(s) always, plus a knockout
 * bracket for cups. Either can be null when there's nothing to show yet.
 */
export async function getCompetitionDetail(slug: string): Promise<CompetitionDetail | null> {
  const comp = (
    await db.select().from(competitions).where(eq(competitions.slug, slug)).limit(1)
  )[0];
  if (!comp) return null;

  const season = seasonFor(slug);
  const standingsGroups = await loadStandings(comp.id, season);
  const bracket = comp.type === "cup" ? await loadBracket(comp.id, season) : [];
  const ranks = await db
    .select({ kind: topPlayers.kind, entries: topPlayers.entries })
    .from(topPlayers)
    .where(and(eq(topPlayers.competitionId, comp.id), eq(topPlayers.season, season)));
  const scorers = ranks.find((r) => r.kind === "scorers")?.entries ?? [];
  const assists = ranks.find((r) => r.kind === "assists")?.entries ?? [];

  return {
    slug: comp.slug,
    name: comp.name,
    type: comp.type,
    country: comp.country,
    standings: standingsGroups.length ? standingsGroups : null,
    bracket: bracket.length ? bracket : null,
    topScorers: scorers.length ? scorers : null,
    topAssists: assists.length ? assists : null,
  };
}
