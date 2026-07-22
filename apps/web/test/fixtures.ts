import type { Broadcaster, Match, MatchEvent } from "@lucarne/shared";

export const broadcaster = (over: Partial<Broadcaster> = {}): Broadcaster => ({
  id: 1,
  slug: "canal-plus",
  name: "CANAL+",
  color: "#4F46E5",
  logoUrl: null,
  coverage: "full",
  override: false,
  note: null,
  ...over,
});

export const goal = (over: Partial<MatchEvent> = {}): MatchEvent => ({
  type: "Goal",
  detail: "Normal Goal",
  minute: 23,
  extraMinute: null,
  player: "Mbappé",
  assist: null,
  side: "home",
  ...over,
});

export const match = (over: Partial<Match> = {}): Match => ({
  id: 1,
  kickoff: "2025-08-16T19:00:00.000Z", // 21:00 Paris (CEST)
  status: "scheduled",
  statusShort: "NS",
  elapsed: null,
  elapsedExtra: null,
  homeGoals: null,
  awayGoals: null,
  homePenalties: null,
  awayPenalties: null,
  competition: { name: "Ligue 1", slug: "ligue-1" },
  home: { name: "PSG", shortName: "PSG", logo: null },
  away: { name: "OM", shortName: "OM", logo: null },
  broadcasters: [broadcaster()],
  events: [],
  ...over,
});
