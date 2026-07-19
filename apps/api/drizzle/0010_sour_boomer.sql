CREATE TABLE `followed_team` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`team` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `followed_device_team_idx` ON `followed_team` (`device_id`,`team`);--> statement-breakpoint
CREATE INDEX `followed_device_idx` ON `followed_team` (`device_id`);--> statement-breakpoint
ALTER TABLE `push_subscription` ADD `device_id` text;