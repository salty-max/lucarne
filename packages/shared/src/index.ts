/**
 * The API wire contract — the JSON shapes exchanged between the Hono API and
 * the React SPA. Single source of truth: the backend types its `/api/*`
 * responses against these, and the frontend consumes them directly.
 *
 * Note: `kickoff` is an ISO string here (JSON has no Date). The backend maps
 * its internal Date-based rows to these at the response boundary.
 */
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed";

export type Broadcaster = {
  id: number;
  slug: string;
  name: string;
  color: string;
  logoUrl: string | null;
  coverage: "full" | "partial";
  override: boolean;
  note: string | null;
};

export type MatchEvent = {
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string | null;
  minute: number | null;
  extraMinute: number | null;
  player: string | null;
  assist: string | null;
  side: "home" | "away" | null;
};

export type Team = {
  name: string;
  shortName: string | null;
  logo: string | null;
};

export type Match = {
  id: number;
  kickoff: string; // ISO 8601
  status: MatchStatus;
  statusShort: string;
  elapsed: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null; // shootout result; null unless decided on penalties
  awayPenalties: number | null;
  competition: { name: string; slug: string };
  home: Team;
  away: Team;
  broadcasters: Broadcaster[];
  events: MatchEvent[];
};

export type Day = {
  key: string;
  label: string;
  matches: Match[];
};

export type LiveMatch = {
  id: number;
  status: MatchStatus;
  elapsed: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
};

export type CompetitionInfo = {
  slug: string;
  name: string;
  type: string; // "league" | "cup"
  country: string;
};

/** One row of a league/group table. */
export type StandingRow = {
  rank: number;
  team: Team;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string | null; // recent results, e.g. "WWDLW"
  description: string | null; // qualification note ("Promotion", "Relegation", …)
};

/** A single table. Leagues have one group ("Overall"); cups can have many. */
export type StandingGroup = {
  label: string; // "Overall" | "Group A" | "League Phase"
  rows: StandingRow[];
};

/** One knockout tie in a bracket (teams are null until the fixture is drawn). */
export type BracketMatch = {
  id: number;
  kickoff: string; // ISO 8601
  status: MatchStatus;
  home: Team | null;
  away: Team | null;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  winner: "home" | "away" | null;
};

/** One column of the bracket (all ties of a knockout round). */
export type BracketRound = {
  name: string; // "Round of 16" | "Final" | …
  matches: BracketMatch[];
};

/** The competition page payload: its tables and/or knockout bracket. */
export type CompetitionDetail = {
  slug: string;
  name: string;
  type: string; // "league" | "cup"
  country: string;
  standings: StandingGroup[] | null;
  bracket: BracketRound[] | null;
};

export type LineupPlayer = {
  name: string;
  number: number | null;
  pos: string | null; // "G" | "D" | "M" | "F"
  grid: string | null; // "row:col" for the starting XI, null for the bench
  rating: number | null; // match rating (e.g. 7.2), null if unrated
};

export type TeamLineup = {
  formation: string | null;
  coach: string | null;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
};

export type MatchLineups = { home: TeamLineup; away: TeamLineup };

/** A curated set of team match statistics; any field may be null (hidden). */
export type TeamStats = {
  possession: number | null; // %
  shots: number | null; // total shots
  shotsOnTarget: number | null;
  xg: number | null; // expected goals
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  saves: number | null;
  passAccuracy: number | null; // %
};

export type MatchStatistics = { home: TeamStats; away: TeamStats };

/** A single match with the extra fields worth showing on its detail page. */
export type MatchDetail = Match & {
  venue: string | null;
  round: string | null;
  referee: string | null;
  lineups: MatchLineups | null;
  statistics: MatchStatistics | null;
};

/** One scheduled-job outcome, as surfaced by the logs page. `at` is an ISO
 *  string; `detail` is the job's result object (or `{ err }` on failure). */
export type RunLogEntry = {
  id: number;
  at: string;
  job: string;
  ok: boolean;
  detail: Record<string, unknown> | null;
  ms: number | null;
};

/** A pickable team for the "My teams" search (no fixtures attached). */
export type TeamOption = { name: string; shortName: string | null };

/** Response bodies. */
export type ScheduleResponse = { days: Day[] };
export type TeamsResponse = { teams: TeamOption[] };
export type MatchDetailResponse = { match: MatchDetail | null };
export type LiveResponse = { matches: LiveMatch[] };
export type CompetitionsResponse = { competitions: CompetitionInfo[] };
export type CompetitionDetailResponse = { competition: CompetitionDetail | null };
export type LogsResponse = { ok: boolean; runs: RunLogEntry[] };
