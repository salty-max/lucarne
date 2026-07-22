import { sql } from "drizzle-orm";
import { db } from "@/db";
import { initLocalDb } from "@/db/local";
import { competitions, matches } from "@/db/schema";
import { runSeed } from "@/db/seed-data";
import { runFullResync } from "@/lib/poller";

// First-boot data bootstrap, run from the container CMD right after migrations
// (`db:migrate && db:bootstrap && start`). Runs IN-PROCESS — no HTTP round-trip,
// no CRON_SECRET — since it already has the DB handle and the API key.
//
// Idempotent + guarded so a restart or redeploy re-runs nothing and re-spends no
// budget: seed only when there is no reference data, resync only when there are
// no fixtures yet. The resync is best-effort — the daily cron + catch-up heal it
// if API-Football hiccups — so a failure never stops the server from starting.

initLocalDb();

async function rowCount(table: typeof competitions | typeof matches): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(table);
  return Number(rows[0]?.n ?? 0);
}

try {
  if ((await rowCount(competitions)) === 0) {
    const r = await runSeed(db);
    console.log(
      `bootstrap: seeded ${r.competitions} competitions, ${r.broadcasters} broadcasters, ${r.rules} rules`,
    );
  } else {
    console.log("bootstrap: reference data already present — skipping seed");
  }

  if ((await rowCount(matches)) === 0) {
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
