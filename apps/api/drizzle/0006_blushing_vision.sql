CREATE TABLE `run_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`job` text NOT NULL,
	`ok` integer NOT NULL,
	`detail` text,
	`ms` integer
);
--> statement-breakpoint
CREATE INDEX `run_log_at_idx` ON `run_log` (`at`);