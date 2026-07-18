import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { MatchStatistics } from "@lucarne/shared";

/**
 * SQLite schema (Cloudflare D1 in prod, bun:sqlite locally/tests).
 * Timestamps are stored as integer unix-ms (Drizzle maps them to/from `Date`),
 * dates as ISO `text` (lexicographic comparison), JSON blobs as `text` json.
 */

export const broadcasters = sqliteTable("broadcasters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#64748b"),
  logoUrl: text("logo_url"),
});

export const competitions = sqliteTable("competitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  apiFootballId: integer("api_football_id").notNull().unique(),
  country: text("country").notNull(),
  type: text("type").notNull().default("league"), // "league" | "cup"
  emblem: text("emblem"),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  apiFootballId: integer("api_football_id").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  logo: text("logo"),
});

export const matches = sqliteTable(
  "matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    apiFootballId: integer("api_football_id").notNull().unique(),
    competitionId: integer("competition_id")
      .notNull()
      .references(() => competitions.id),
    season: integer("season").notNull(),
    round: text("round"),
    kickoff: integer("kickoff", { mode: "timestamp_ms" }).notNull(),
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
    statistics: text("statistics", { mode: "json" }).$type<MatchStatistics>(),
    // Player match ratings keyed by side then jersey number (lineups store
    // abbreviated names, so number is the reliable join to the lineup rows).
    playerRatings: text("player_ratings", { mode: "json" }).$type<{
      home: Record<string, number>;
      away: Record<string, number>;
    }>(),
    detailsFetchedAt: integer("details_fetched_at", { mode: "timestamp_ms" }),
    lineupsFetchedAt: integer("lineups_fetched_at", { mode: "timestamp_ms" }),
    statsFetchedAt: integer("stats_fetched_at", { mode: "timestamp_ms" }),
    ratingsFetchedAt: integer("ratings_fetched_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("matches_kickoff_idx").on(t.kickoff),
    index("matches_status_idx").on(t.status),
    index("matches_competition_idx").on(t.competitionId),
  ],
);

export const matchEvents = sqliteTable(
  "match_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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

export const matchLineups = sqliteTable(
  "match_lineups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    starter: integer("starter", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("match_lineups_match_idx").on(t.matchId)],
);

export const standings = sqliteTable(
  "standings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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

export const broadcastRules = sqliteTable(
  "broadcast_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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

export const broadcastOverrides = sqliteTable(
  "broadcast_overrides",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Rolling history of scheduled-job outcomes (sync, live, lineups, eager/nightly
// drain) so the cron behaviour is queryable from the app, not just `wrangler
// tail`. Pruned to ~a week by `recordRun`; `detail` holds the job's result JSON.
export const runLog = sqliteTable(
  "run_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    job: text("job").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    ms: integer("ms"),
  },
  (t) => [index("run_log_at_idx").on(t.at)],
);

// A browser's Web Push subscription + who/what it wants to hear about. `teams`
// are the followed team names to match against; `triggers` are the event kinds
// (goal, yellow, red, kickoff, ft) the user opted into.
export const pushSubscription = sqliteTable("push_subscription", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  teams: text("teams", { mode: "json" }).$type<string[]>().notNull(),
  triggers: text("triggers", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Dedup ledger: one row per (match, event) already pushed, so re-fetching a
// match's events on the next tick never sends a goal/card twice. `key` is a
// stable event key, or "KO"/"FT" for the kickoff reminder + full-time.
export const pushNotified = sqliteTable(
  "push_notified",
  {
    matchId: integer("match_id").notNull(),
    key: text("key").notNull(),
    at: integer("at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.key] }), index("push_notified_at_idx").on(t.at)],
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
