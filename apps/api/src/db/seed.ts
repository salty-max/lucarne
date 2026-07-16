import { db } from "@/db";
import { initLocalDb } from "@/db/local";
import { runSeed } from "@/db/seed-data";

// CLI seed for the local bun:sqlite database (run `bun run db:migrate` first).
// D1 is seeded via the authed POST /api/admin/seed endpoint (same logic).
initLocalDb();

runSeed(db)
  .then((r) => {
    console.log(
      `Seeded ${r.broadcasters} broadcasters, ${r.competitions} competitions, ${r.rules} rules.`,
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
