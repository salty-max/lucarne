CREATE TABLE "broadcast_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"broadcaster_id" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "broadcast_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"competition_id" integer NOT NULL,
	"broadcaster_id" integer NOT NULL,
	"valid_from" text NOT NULL,
	"valid_to" text NOT NULL,
	"coverage" text DEFAULT 'full' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "broadcasters" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"logo_url" text,
	CONSTRAINT "broadcasters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"api_football_id" integer NOT NULL,
	"country" text NOT NULL,
	"type" text DEFAULT 'league' NOT NULL,
	"emblem" text,
	CONSTRAINT "competitions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "competitions_api_football_id_unique" UNIQUE("api_football_id")
);
--> statement-breakpoint
CREATE TABLE "followed_team" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"team" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"team_id" integer,
	"minute" integer,
	"extra_minute" integer,
	"type" text NOT NULL,
	"detail" text,
	"player" text,
	"assist" text,
	"comments" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_lineups" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"player" text NOT NULL,
	"number" integer,
	"pos" text,
	"grid" text,
	"starter" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_football_id" integer NOT NULL,
	"competition_id" integer NOT NULL,
	"season" integer NOT NULL,
	"round" text,
	"kickoff" timestamp with time zone NOT NULL,
	"status_short" text DEFAULT 'NS' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"elapsed" integer,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"home_penalties" integer,
	"away_penalties" integer,
	"venue" text,
	"referee" text,
	"home_formation" text,
	"away_formation" text,
	"home_coach" text,
	"away_coach" text,
	"statistics" jsonb,
	"player_ratings" jsonb,
	"pred_home" integer,
	"pred_draw" integer,
	"pred_away" integer,
	"pred_advice" text,
	"motm_name" text,
	"motm_side" text,
	"motm_rating" double precision,
	"details_fetched_at" timestamp with time zone,
	"lineups_fetched_at" timestamp with time zone,
	"stats_fetched_at" timestamp with time zone,
	"ratings_fetched_at" timestamp with time zone,
	"predictions_fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "matches_api_football_id_unique" UNIQUE("api_football_id")
);
--> statement-breakpoint
CREATE TABLE "push_notified" (
	"match_id" integer NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "push_notified_match_id_key_pk" PRIMARY KEY("match_id","key")
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device_id" text,
	"teams" jsonb NOT NULL,
	"triggers" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"job" text NOT NULL,
	"ok" boolean NOT NULL,
	"detail" jsonb,
	"ms" integer
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"competition_id" integer NOT NULL,
	"season" integer NOT NULL,
	"group_label" text,
	"rank" integer NOT NULL,
	"team_id" integer NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"win" integer DEFAULT 0 NOT NULL,
	"draw" integer DEFAULT 0 NOT NULL,
	"lose" integer DEFAULT 0 NOT NULL,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"goals_diff" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"form" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_football_id" integer NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"logo" text,
	CONSTRAINT "teams_api_football_id_unique" UNIQUE("api_football_id")
);
--> statement-breakpoint
CREATE TABLE "top_players" (
	"competition_id" integer NOT NULL,
	"season" integer NOT NULL,
	"kind" text NOT NULL,
	"entries" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "top_players_competition_id_season_kind_pk" PRIMARY KEY("competition_id","season","kind")
);
--> statement-breakpoint
CREATE TABLE "watched_match" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"match_id" integer NOT NULL,
	"state" text DEFAULT 'on' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast_overrides" ADD CONSTRAINT "broadcast_overrides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_overrides" ADD CONSTRAINT "broadcast_overrides_broadcaster_id_broadcasters_id_fk" FOREIGN KEY ("broadcaster_id") REFERENCES "public"."broadcasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_rules" ADD CONSTRAINT "broadcast_rules_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_rules" ADD CONSTRAINT "broadcast_rules_broadcaster_id_broadcasters_id_fk" FOREIGN KEY ("broadcaster_id") REFERENCES "public"."broadcasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_players" ADD CONSTRAINT "top_players_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_overrides_match_broadcaster_idx" ON "broadcast_overrides" USING btree ("match_id","broadcaster_id");--> statement-breakpoint
CREATE INDEX "broadcast_rules_competition_idx" ON "broadcast_rules" USING btree ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "followed_device_team_idx" ON "followed_team" USING btree ("device_id","team");--> statement-breakpoint
CREATE INDEX "followed_device_idx" ON "followed_team" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_lineups_match_idx" ON "match_lineups" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "matches_kickoff_idx" ON "matches" USING btree ("kickoff");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_competition_idx" ON "matches" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "push_notified_at_idx" ON "push_notified" USING btree ("at");--> statement-breakpoint
CREATE INDEX "run_log_at_idx" ON "run_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "standings_competition_idx" ON "standings" USING btree ("competition_id","season");--> statement-breakpoint
CREATE UNIQUE INDEX "watched_device_match_idx" ON "watched_match" USING btree ("device_id","match_id");--> statement-breakpoint
CREATE INDEX "watched_match_match_idx" ON "watched_match" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "watched_match_device_idx" ON "watched_match" USING btree ("device_id");