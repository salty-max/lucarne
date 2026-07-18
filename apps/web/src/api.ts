import type {
  CompetitionDetail,
  CompetitionInfo,
  Day,
  LiveMatch,
  MatchDetail,
  RunLogEntry,
  TeamOption,
} from "@lucarne/shared";

export type ScheduleParams = { from?: string; days?: number; competition?: string };

export async function fetchSchedule(params: ScheduleParams = {}): Promise<Day[]> {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.days != null) q.set("days", String(params.days));
  if (params.competition) q.set("competition", params.competition);
  const res = await fetch(`/api/schedule?${q.toString()}`);
  if (!res.ok) throw new Error(`schedule ${res.status}`);
  const data = (await res.json()) as { days?: Day[] };
  return data.days ?? [];
}

export async function fetchMatch(id: number): Promise<MatchDetail | null> {
  const res = await fetch(`/api/match/${id}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { match?: MatchDetail | null };
  return data.match ?? null;
}

export async function fetchLive(): Promise<LiveMatch[]> {
  const res = await fetch("/api/live", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { matches?: LiveMatch[] };
  return data.matches ?? [];
}

export async function fetchCompetitions(): Promise<CompetitionInfo[]> {
  const res = await fetch("/api/competitions");
  if (!res.ok) throw new Error(`competitions ${res.status}`);
  const data = (await res.json()) as { competitions?: CompetitionInfo[] };
  return data.competitions ?? [];
}

export async function fetchCompetition(slug: string): Promise<CompetitionDetail | null> {
  const res = await fetch(`/api/competition/${slug}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { competition?: CompetitionDetail | null };
  return data.competition ?? null;
}

export async function fetchLogs(limit = 100): Promise<RunLogEntry[]> {
  const res = await fetch(`/api/logs?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`logs ${res.status}`);
  const data = (await res.json()) as { runs?: RunLogEntry[] };
  return data.runs ?? [];
}

export async function fetchTeams(): Promise<TeamOption[]> {
  const res = await fetch("/api/teams");
  if (!res.ok) throw new Error(`teams ${res.status}`);
  const data = (await res.json()) as { teams?: TeamOption[] };
  return data.teams ?? [];
}
