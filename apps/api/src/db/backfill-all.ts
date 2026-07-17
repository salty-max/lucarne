import { initLocalDb } from "@/db/local";
import { COMPETITIONS, currentSeason } from "@/lib/competitions";
import { backfillFixtures } from "@/lib/ingest";

/**
 * One-off: backfill fixtures for EVERY tracked competition over a date range,
 * each at its own season (World Cup keeps its override, the rest use
 * currentSeason()). Handy to populate a whole window at once, e.g. the
 * summer — European qualifiers in July + domestic openers in August.
 *
 *   bun run src/db/backfill-all.ts [from=YYYY-MM-DD] [to=YYYY-MM-DD]
 */
initLocalDb();

const [from = "2026-07-01", to = "2026-08-31"] = process.argv.slice(2);
console.log(`Backfilling all competitions ${from} → ${to}...`);

let total = 0;
for (const c of COMPETITIONS) {
  const season = c.season ?? currentSeason();
  try {
    const n = await backfillFixtures(c.apiFootballId, season, from, to); // client retries on rate limit
    console.log(`  ${c.slug.padEnd(18)} S${season}: ${n} fixtures`);
    total += n;
  } catch (err) {
    console.error(`  ${c.slug} failed:`, err);
  }
}
console.log(`Total: ${total} fixtures (${from} → ${to}).`);
process.exit(0);
