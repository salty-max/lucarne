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

/** Response bodies. */
export type ScheduleResponse = { days: Day[] };
export type LiveResponse = { matches: LiveMatch[] };
export type CompetitionsResponse = { competitions: CompetitionInfo[] };
