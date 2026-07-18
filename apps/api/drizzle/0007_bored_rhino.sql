CREATE TABLE `push_notified` (
	`match_id` integer NOT NULL,
	`key` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`match_id`, `key`)
);
--> statement-breakpoint
CREATE INDEX `push_notified_at_idx` ON `push_notified` (`at`);--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`teams` text NOT NULL,
	`triggers` text NOT NULL,
	`created_at` integer NOT NULL
);
