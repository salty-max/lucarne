CREATE TABLE `watched_match` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`match_id` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watched_device_match_idx` ON `watched_match` (`device_id`,`match_id`);--> statement-breakpoint
CREATE INDEX `watched_match_match_idx` ON `watched_match` (`match_id`);--> statement-breakpoint
CREATE INDEX `watched_match_device_idx` ON `watched_match` (`device_id`);