ALTER TABLE "matches" ADD COLUMN "elapsed_extra" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "drain_attempts" integer DEFAULT 0 NOT NULL;