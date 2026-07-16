// Backfill a competition over an explicit date range into the local db, e.g. a
// whole tournament (beyond the daily sync's next-14-days window).
//   bun run src/db/backfill.ts [leagueId] [season] [from] [to]
// Defaults to the 2026 World Cup.
import { initLocalDb } from "@/db/local";
import { backfillFixtures } from "@/lib/ingest";

initLocalDb();

const [league = "1", season = "2026", from = "2026-06-01", to = "2026-07-31"] = process.argv.slice(2);
const n = await backfillFixtures(Number(league), Number(season), from, to);
console.log(`Backfilled ${n} fixtures (league ${league}, season ${season}, ${from}→${to}).`);
process.exit(0);
