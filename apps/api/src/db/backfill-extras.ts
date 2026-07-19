/**
 * One-shot backfill for the newer per-competition / per-match extras, so a local
 * db is up to date without waiting for the daily sync + prediction poll:
 *   - top scorers / assists for every tracked competition
 *   - pre-match predictions for scheduled matches in the next 7 days
 *
 *   bun run db:backfill-extras
 *
 * Real API requests, no budget gate (a manual dev top-up). Re-runnable: already-
 * predicted matches are skipped; rankings are replaced.
 */
import { and, asc, isNull, lte } from "drizzle-orm";
import { initLocalDb } from "@/db/local";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { storeMatchPredictions, syncAllTopPlayers } from "@/lib/ingest";

initLocalDb();

console.log("Backfilling top scorers/assists…");
const top = await syncAllTopPlayers();
console.log(`  ${top.competitions} competitions · ${top.requestsUsed} requests.`);

console.log("Backfilling predictions (all past matches + next 7 days)…");
const now = Date.now();
const targets = await db
  .select({ id: matches.id, apiFootballId: matches.apiFootballId })
  .from(matches)
  .where(
    and(
      isNull(matches.predictionsFetchedAt),
      lte(matches.kickoff, new Date(now + 7 * 24 * 60 * 60_000)),
    ),
  )
  .orderBy(asc(matches.kickoff));

let stored = 0;
for (const m of targets) {
  try {
    stored += await storeMatchPredictions(m);
  } catch (err) {
    console.error("  pred fail", m.id, String(err));
  }
}
console.log(`  ${targets.length} matches fetched · ${stored} predictions stored.`);
console.log("Done.");
process.exit(0);
