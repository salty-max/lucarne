CREATE TABLE `standings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition_id` integer NOT NULL,
	`season` integer NOT NULL,
	`group_label` text,
	`rank` integer NOT NULL,
	`team_id` integer NOT NULL,
	`played` integer DEFAULT 0 NOT NULL,
	`win` integer DEFAULT 0 NOT NULL,
	`draw` integer DEFAULT 0 NOT NULL,
	`lose` integer DEFAULT 0 NOT NULL,
	`goals_for` integer DEFAULT 0 NOT NULL,
	`goals_against` integer DEFAULT 0 NOT NULL,
	`goals_diff` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`form` text,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `standings_competition_idx` ON `standings` (`competition_id`,`season`);