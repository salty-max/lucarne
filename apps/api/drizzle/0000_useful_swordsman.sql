CREATE TABLE `broadcast_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`broadcaster_id` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`broadcaster_id`) REFERENCES `broadcasters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broadcast_overrides_match_broadcaster_idx` ON `broadcast_overrides` (`match_id`,`broadcaster_id`);--> statement-breakpoint
CREATE TABLE `broadcast_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition_id` integer NOT NULL,
	`broadcaster_id` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text NOT NULL,
	`coverage` text DEFAULT 'full' NOT NULL,
	`note` text,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`broadcaster_id`) REFERENCES `broadcasters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `broadcast_rules_competition_idx` ON `broadcast_rules` (`competition_id`);--> statement-breakpoint
CREATE TABLE `broadcasters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`logo_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broadcasters_slug_unique` ON `broadcasters` (`slug`);--> statement-breakpoint
CREATE TABLE `competitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`api_football_id` integer NOT NULL,
	`country` text NOT NULL,
	`type` text DEFAULT 'league' NOT NULL,
	`emblem` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitions_slug_unique` ON `competitions` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `competitions_api_football_id_unique` ON `competitions` (`api_football_id`);--> statement-breakpoint
CREATE TABLE `match_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`team_id` integer,
	`minute` integer,
	`extra_minute` integer,
	`type` text NOT NULL,
	`detail` text,
	`player` text,
	`assist` text,
	`comments` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `match_events_match_idx` ON `match_events` (`match_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_football_id` integer NOT NULL,
	`competition_id` integer NOT NULL,
	`season` integer NOT NULL,
	`round` text,
	`kickoff` integer NOT NULL,
	`status_short` text DEFAULT 'NS' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`elapsed` integer,
	`home_team_id` integer NOT NULL,
	`away_team_id` integer NOT NULL,
	`home_goals` integer,
	`away_goals` integer,
	`venue` text,
	`details_fetched_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_api_football_id_unique` ON `matches` (`api_football_id`);--> statement-breakpoint
CREATE INDEX `matches_kickoff_idx` ON `matches` (`kickoff`);--> statement-breakpoint
CREATE INDEX `matches_status_idx` ON `matches` (`status`);--> statement-breakpoint
CREATE INDEX `matches_competition_idx` ON `matches` (`competition_id`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_football_id` integer NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`logo` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_api_football_id_unique` ON `teams` (`api_football_id`);