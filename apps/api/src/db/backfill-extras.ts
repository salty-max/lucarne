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
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { initLocalDb } from "@/db/local";
import { db } from "@/db";
import { matchLineups, matches } from "@/db/schema";
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

// Man of the match — computed from already-stored ratings + lineups, no API cost.
console.log("Backfilling man of the match (from stored ratings)…");
const finished = await db
  .select({
    id: matches.id,
    homeTeamId: matches.homeTeamId,
    awayTeamId: matches.awayTeamId,
    playerRatings: matches.playerRatings,
  })
  .from(matches)
  .where(and(eq(matches.status, "finished"), isNull(matches.motmName)));
let motmSet = 0;
for (const r of finished) {
  const pr = r.playerRatings;
  if (!pr) continue;
  let best: { side: "home" | "away"; num: string; rating: number } | null = null;
  for (const side of ["home", "away"] as const) {
    for (const [num, rating] of Object.entries(pr[side] ?? {})) {
      if (!best || rating > best.rating) best = { side, num, rating };
    }
  }
  if (!best) continue;
  const teamId = best.side === "home" ? r.homeTeamId : r.awayTeamId;
  const lu = await db
    .select({ player: matchLineups.player })
    .from(matchLineups)
    .where(
      and(
        eq(matchLineups.matchId, r.id),
        eq(matchLineups.teamId, teamId),
        eq(matchLineups.number, Number(best.num)),
      ),
    )
    .limit(1);
  if (!lu[0]) continue;
  await db
    .update(matches)
    .set({ motmName: lu[0].player, motmSide: best.side, motmRating: best.rating })
    .where(eq(matches.id, r.id));
  motmSet += 1;
}
console.log(`  ${motmSet} man-of-the-match set.`);
console.log("Done.");
process.exit(0);
