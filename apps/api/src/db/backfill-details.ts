import { and, desc, eq, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { matches, teams } from "@/db/schema";
import { initLocalDb } from "@/db/local";
import {
  storeMatchEvents,
  storeMatchLineups,
  storeMatchPlayerRatings,
  storeMatchStatistics,
} from "@/lib/ingest";

/**
 * One-shot local backfill of post-match details for every finished match that's
 * missing them — scorers/cards (events) and/or confirmed lineups. No date cutoff,
 * no budget gate (that's a prod-quota concern). One API request per missing piece.
 * Re-runnable: already-fetched matches are skipped.
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
    hasDetails: matches.detailsFetchedAt,
    hasLineups: matches.lineupsFetchedAt,
    hasStats: matches.statsFetchedAt,
    hasRatings: matches.ratingsFetchedAt,
  })
  .from(matches)
  .innerJoin(home, eq(matches.homeTeamId, home.id))
  .innerJoin(away, eq(matches.awayTeamId, away.id))
  .where(
    and(
      eq(matches.status, "finished"),
      or(
        isNull(matches.detailsFetchedAt),
        isNull(matches.lineupsFetchedAt),
        isNull(matches.statsFetchedAt),
        isNull(matches.ratingsFetchedAt),
      ),
    ),
  )
  .orderBy(desc(matches.kickoff));

console.log(`Backfilling ${candidates.length} matches...`);

let events = 0;
let lineups = 0;
let stats = 0;
let ratings = 0;
let done = 0;
for (const m of candidates) {
  try {
    if (m.hasDetails == null) events += await storeMatchEvents(m); // 1 request
    if (m.hasLineups == null) lineups += await storeMatchLineups(m); // 1 request
    if (m.hasStats == null) {
      await storeMatchStatistics(m); // 1 request
      stats += 1;
    }
    if (m.hasRatings == null) {
      await storeMatchPlayerRatings(m); // 1 request
      ratings += 1;
    }
    done += 1;
    if (done % 10 === 0 || done === candidates.length) {
      console.log(
        `  ${done}/${candidates.length} — ${events} events, ${lineups} lineups, ${stats} stats, ${ratings} ratings`,
      );
    }
  } catch (err) {
    console.error(`  match ${m.id} (api ${m.apiFootballId}) failed:`, err);
  }
}

console.log(
  `Done: ${done}/${candidates.length} matches, ${events} events, ${lineups} lineups, ${stats} stats, ${ratings} ratings.`,
);
process.exit(0);
