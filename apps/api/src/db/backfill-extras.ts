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
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { initLocalDb } from "@/db/local";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { storeMatchPredictions, syncAllTopPlayers } from "@/lib/ingest";

initLocalDb();

console.log("Backfilling top scorers/assists…");
const top = await syncAllTopPlayers();
console.log(`  ${top.competitions} competitions · ${top.requestsUsed} requests.`);

console.log("Backfilling predictions (scheduled matches, next 7 days)…");
const now = Date.now();
const upcoming = await db
  .select({ id: matches.id, apiFootballId: matches.apiFootballId })
  .from(matches)
  .where(
    and(
      eq(matches.status, "scheduled"),
      isNull(matches.predictionsFetchedAt),
      gte(matches.kickoff, new Date(now)),
      lte(matches.kickoff, new Date(now + 7 * 24 * 60 * 60_000)),
    ),
  )
  .orderBy(asc(matches.kickoff));

let stored = 0;
for (const m of upcoming) {
  try {
    stored += await storeMatchPredictions(m);
  } catch (err) {
    console.error("  pred fail", m.id, String(err));
  }
}
console.log(`  ${upcoming.length} matches fetched · ${stored} predictions stored.`);
console.log("Done.");
process.exit(0);
