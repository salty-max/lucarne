import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { matches, teams } from "@/db/schema";
import { initLocalDb } from "@/db/local";
import { storeMatchEvents } from "@/lib/ingest";

/**
 * One-shot local backfill of post-match details (scorers/cards) for every
 * finished match that doesn't have them yet — no date cutoff, no budget gate
 * (that's a prod-quota concern; locally we just want the data). Costs one
 * API request per match. Re-runnable: already-detailed matches are skipped.
 *
 *   bun run db:backfill-details
 */
initLocalDb();

const home = alias(teams, "home");
const away = alias(teams, "away");

const candidates = await db
  .select({
    id: matches.id,
    apiFootballId: matches.apiFootballId,
    homeTeamId: matches.homeTeamId,
    homeApiId: home.apiFootballId,
    awayTeamId: matches.awayTeamId,
    awayApiId: away.apiFootballId,
  })
  .from(matches)
  .innerJoin(home, eq(matches.homeTeamId, home.id))
  .innerJoin(away, eq(matches.awayTeamId, away.id))
  .where(and(eq(matches.status, "finished"), isNull(matches.detailsFetchedAt)))
  .orderBy(desc(matches.kickoff));

console.log(`Backfilling details for ${candidates.length} matches...`);

let events = 0;
let done = 0;
for (const m of candidates) {
  try {
    events += await storeMatchEvents(m); // 1 API request each
    done += 1;
    if (done % 10 === 0 || done === candidates.length) {
      console.log(`  ${done}/${candidates.length} matches, ${events} events`);
    }
  } catch (err) {
    console.error(`  match ${m.id} (api ${m.apiFootballId}) failed:`, err);
  }
}

console.log(`Done: ${done}/${candidates.length} matches, ${events} events stored.`);
process.exit(0);
