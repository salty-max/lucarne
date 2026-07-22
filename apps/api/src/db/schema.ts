import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { MatchStatistics, TopPlayerEntry } from "@lucarne/shared";

/**
 * Postgres schema (managed Postgres in prod, a docker Postgres locally/tests).
 * Timestamps are real `timestamp` columns that Drizzle maps to/from `Date` (the
 * app still sees Date everywhere, unchanged from the old sqlite epoch-ms mapping);
 * dates stay ISO `text` (lexicographic comparison); JSON is `jsonb`.
 */

export const broadcasters = pgTable("broadcasters", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#64748b"),
  logoUrl: text("logo_url"),
});

export const competitions = pgTable("competitions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  apiFootballId: integer("api_football_id").notNull().unique(),
  country: text("country").notNull(),
  type: text("type").notNull().default("league"), // "league" | "cup"
  emblem: text("emblem"),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  apiFootballId: integer("api_football_id").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  logo: text("logo"),
});

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    apiFootballId: integer("api_football_id").notNull().unique(),
    competitionId: integer("competition_id")
      .notNull()
      .references(() => competitions.id),
    season: integer("season").notNull(),
    round: text("round"),
    kickoff: timestamp("kickoff", { mode: "date", withTimezone: true }).notNull(),
    statusShort: text("status_short").notNull().default("NS"),
    status: text("status").notNull().default("scheduled"),
    elapsed: integer("elapsed"),
    homeTeamId: integer("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer("away_team_id")
      .notNull()
      .references(() => teams.id),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    // Penalty-shootout result (knockout ties decided on penalties). Null unless
    // the match went to a shootout; goals still hold the post-ET score.
    homePenalties: integer("home_penalties"),
    awayPenalties: integer("away_penalties"),
    venue: text("venue"),
    referee: text("referee"),
    homeFormation: text("home_formation"),
    awayFormation: text("away_formation"),
    homeCoach: text("home_coach"),
    awayCoach: text("away_coach"),
    statistics: jsonb("statistics").$type<MatchStatistics>(),
    // Player match ratings keyed by side then jersey number (lineups store
    // abbreviated names, so number is the reliable join to the lineup rows).
    playerRatings: jsonb("player_ratings").$type<{
      home: Record<string, number>;
      away: Record<string, number>;
    }>(),
    // Pre-match prediction (win %, advice) from API-Football, fetched once before
    // kickoff. Percentages are 0–100 ints; advice is the API's one-line tip.
    predHome: integer("pred_home"),
    predDraw: integer("pred_draw"),
    predAway: integer("pred_away"),
    predAdvice: text("pred_advice"),
    // Man of the match = the top-rated player, resolved when ratings land.
    motmName: text("motm_name"),
    motmSide: text("motm_side"), // "home" | "away"
    motmRating: doublePrecision("motm_rating"),

    detailsFetchedAt: timestamp("details_fetched_at", { mode: "date", withTimezone: true }),
    lineupsFetchedAt: timestamp("lineups_fetched_at", { mode: "date", withTimezone: true }),
    statsFetchedAt: timestamp("stats_fetched_at", { mode: "date", withTimezone: true }),
    ratingsFetchedAt: timestamp("ratings_fetched_at", { mode: "date", withTimezone: true }),
    predictionsFetchedAt: timestamp("predictions_fetched_at", { mode: "date", withTimezone: true }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("matches_kickoff_idx").on(t.kickoff),
    index("matches_status_idx").on(t.status),
    index("matches_competition_idx").on(t.competitionId),
  ],
);

export const matchEvents = pgTable(
  "match_events",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    teamId: integer("team_id").references(() => teams.id),
    minute: integer("minute"),
    extraMinute: integer("extra_minute"),
    type: text("type").notNull(), // "Goal" | "Card" | "subst" | "Var"
    detail: text("detail"),
    player: text("player"),
    assist: text("assist"),
    comments: text("comments"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("match_events_match_idx").on(t.matchId)],
);

export const matchLineups = pgTable(
  "match_lineups",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    player: text("player").notNull(),
    number: integer("number"),
    pos: text("pos"), // "G" | "D" | "M" | "F"
    grid: text("grid"), // "row:col" for the starting XI, null for substitutes
    starter: boolean("starter").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("match_lineups_match_idx").on(t.matchId)],
);

export const standings = pgTable(
  "standings",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .notNull()
      .references(() => competitions.id),
    season: integer("season").notNull(),
    // Null/"Overall" for a single-table league; "Group A" etc. for cups.
    groupLabel: text("group_label"),
    rank: integer("rank").notNull(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    played: integer("played").notNull().default(0),
    win: integer("win").notNull().default(0),
    draw: integer("draw").notNull().default(0),
    lose: integer("lose").notNull().default(0),
    goalsFor: integer("goals_for").notNull().default(0),
    goalsAgainst: integer("goals_against").notNull().default(0),
    goalsDiff: integer("goals_diff").notNull().default(0),
    points: integer("points").notNull().default(0),
    form: text("form"),
    description: text("description"),
    // Preserves the API's group + rank ordering across a replace-all upsert.
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("standings_competition_idx").on(t.competitionId, t.season)],
);

export const broadcastRules = pgTable(
  "broadcast_rules",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .notNull()
      .references(() => competitions.id),
    broadcasterId: integer("broadcaster_id")
      .notNull()
      .references(() => broadcasters.id),
    validFrom: text("valid_from").notNull(), // ISO date "YYYY-MM-DD"
    validTo: text("valid_to").notNull(),
    coverage: text("coverage").notNull().default("full"), // "full" | "partial"
    note: text("note"),
  },
  (t) => [index("broadcast_rules_competition_idx").on(t.competitionId)],
);

export const broadcastOverrides = pgTable(
  "broadcast_overrides",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    broadcasterId: integer("broadcaster_id")
      .notNull()
      .references(() => broadcasters.id),
    note: text("note"),
  },
  (t) => [uniqueIndex("broadcast_overrides_match_broadcaster_idx").on(t.matchId, t.broadcasterId)],
);

export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Rolling history of scheduled-job outcomes (sync, live, lineups, eager/nightly
// drain) so the cron behaviour is queryable from the app. Pruned to ~a week by
// `recordRun`; `detail` holds the job's result JSON.
export const runLog = pgTable(
  "run_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { mode: "date", withTimezone: true }).notNull(),
    job: text("job").notNull(),
    ok: boolean("ok").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ms: integer("ms"),
  },
  (t) => [index("run_log_at_idx").on(t.at)],
);

// A browser's Web Push subscription + who/what it wants to hear about. `teams`
// are the followed team names to match against; `triggers` are the event kinds
// (goal, yellow, red, kickoff, ft) the user opted into.
export const pushSubscription = pgTable("push_subscription", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  // Which device this browser endpoint belongs to — push now targets the matches
  // a DEVICE is surveilling (watched_match ∪ followed_team), not a teams[] list.
  // Nullable for legacy rows until they re-subscribe. `teams` is legacy/unused.
  deviceId: text("device_id"),
  teams: jsonb("teams").$type<string[]>().notNull(),
  triggers: jsonb("triggers").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

// A device's followed teams — the server-side mirror of the client's favourites,
// synced independently of push (so auto-surveillance works without notifications).
// Drives both live enrichment (auto-watch) and push targeting, per device.
export const followedTeam = pgTable(
  "followed_team",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    team: text("team").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("followed_device_team_idx").on(t.deviceId, t.team),
    index("followed_device_idx").on(t.deviceId),
  ],
);

// Dedup ledger: one row per (match, event) already pushed, so re-fetching a
// match's events on the next tick never sends a goal/card twice. `key` is a
// stable event key, or "KO"/"FT" for the kickoff reminder + full-time.
export const pushNotified = pgTable(
  "push_notified",
  {
    matchId: integer("match_id").notNull(),
    key: text("key").notNull(),
    at: timestamp("at", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.key] }), index("push_notified_at_idx").on(t.at)],
);

// Active surveillance ("radar"): one row per (device, match) the user chose to
// monitor. Drives the per-minute live enrichment — only WATCHED live matches get
// events/stats each tick — and push. Keyed by an anonymous client `deviceId`.
export const watchedMatch = pgTable(
  "watched_match",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    matchId: integer("match_id").notNull(),
    // "on" = watch this match; "off" = mute it, which OVERRIDES the followed-team
    // auto-surveillance (so you can drop one of your club's matches). Absent row =
    // default (auto-surveilled iff a followed team plays).
    state: text("state").notNull().default("on"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("watched_device_match_idx").on(t.deviceId, t.matchId),
    index("watched_match_match_idx").on(t.matchId),
    index("watched_match_device_idx").on(t.deviceId),
  ],
);

// Top scorers / assists ranking per competition+season, stored as one JSON list
// per kind. Refreshed on the daily sync alongside standings.
export const topPlayers = pgTable(
  "top_players",
  {
    competitionId: integer("competition_id")
      .notNull()
      .references(() => competitions.id),
    season: integer("season").notNull(),
    kind: text("kind").notNull(), // "scorers" | "assists"
    entries: jsonb("entries").$type<TopPlayerEntry[]>().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.season, t.kind] })],
);

export type Broadcaster = typeof broadcasters.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type MatchEvent = typeof matchEvents.$inferSelect;
export type MatchLineup = typeof matchLineups.$inferSelect;
export type Standing = typeof standings.$inferSelect;
export type BroadcastRule = typeof broadcastRules.$inferSelect;
export type RunLog = typeof runLog.$inferSelect;
export type PushSubscription = typeof pushSubscription.$inferSelect;
export type WatchedMatch = typeof watchedMatch.$inferSelect;
export type FollowedTeam = typeof followedTeam.$inferSelect;
