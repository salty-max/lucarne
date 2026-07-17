CREATE TABLE `match_lineups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`team_id` integer NOT NULL,
	`player` text NOT NULL,
	`number` integer,
	`pos` text,
	`grid` text,
	`starter` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `match_lineups_match_idx` ON `match_lineups` (`match_id`);--> statement-breakpoint
ALTER TABLE `matches` ADD `home_formation` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `away_formation` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `home_coach` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `away_coach` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `lineups_fetched_at` integer;