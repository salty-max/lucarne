import { sql } from "drizzle-orm";
import { db } from "@/db";
import { initLocalDb } from "@/db/local";
import { matches } from "@/db/schema";
import { runSeed } from "@/db/seed-data";
import { runFullResync } from "@/lib/poller";

// First-boot data bootstrap, run from the container CMD right after migrations
// (`db:migrate && db:bootstrap && start`). Runs IN-PROCESS — no HTTP round-trip,
// no CRON_SECRET — since it already has the DB handle and the API key.
//
// Seed runs on EVERY boot (idempotent upserts, local, no API cost) so a code
// change to the reference data — a new competition, a broadcast rule — applies on
// the next deploy without a manual step. Resync is guarded on an empty calendar
// because it costs API budget; a new competition's fixtures are then pulled by the
// weekly resync (or a manual one). Resync is best-effort — the daily cron heals it
// if API-Football hiccups — so a failure never stops the server from starting.

initLocalDb();

async function matchCount(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(matches);
  return Number(rows[0]?.n ?? 0);
}

try {
  const r = await runSeed(db);
  console.log(
    `bootstrap: seeded ${r.competitions} competitions, ${r.broadcasters} broadcasters, ${r.rules} rules`,
  );

  if ((await matchCount()) === 0) {
    console.log("bootstrap: empty calendar — running full-season resync…");
    try {
      const r = await runFullResync();
      console.log(
        `bootstrap: resync loaded ${r.fixtures} fixtures across ${r.competitions} competitions`,
      );
    } catch (err) {
      console.error("bootstrap: resync failed — the daily cron will heal it:", String(err));
    }
  } else {
    console.log("bootstrap: calendar already present — skipping resync");
  }
} catch (err) {
  console.error("bootstrap: unexpected error (starting the server anyway):", String(err));
}

// Force exit — postgres.js keeps its pool open otherwise, which would hang the
// `&& start` step in the CMD chain.
process.exit(0);
