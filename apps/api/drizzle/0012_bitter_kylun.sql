CREATE TABLE `top_players` (
	`competition_id` integer NOT NULL,
	`season` integer NOT NULL,
	`kind` text NOT NULL,
	`entries` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`competition_id`, `season`, `kind`),
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE no action
);
