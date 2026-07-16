import cron from "node-cron";
import { runDetailsDrain, runFixtureSync, runLivePollTick } from "@/lib/poller";
import { memoryCache } from "@/lib/scheduleCache";

/**
 * In-process scheduler. Because Lucarne runs as a long-lived Node process, we
 * don't need any platform cron (and thus dodge Vercel Hobby's once-a-day limit):
 *
 *   - fixtures: synced once a day (~7 API requests)
 *   - live: a tick every 2 min, but window-gated + budget-throttled inside
 *     runLivePollTick(), so most ticks cost ZERO API-Football requests.
 */
export function startScheduler(): void {
  cron.schedule("0 5 * * *", async () => {
    try {
      console.log("[sync]", await runFixtureSync(memoryCache));
    } catch (err) {
      console.error("[sync] failed", err);
    }
  });

  cron.schedule("*/2 * * * *", async () => {
    try {
      const r = await runLivePollTick(new Date(), memoryCache);
      if (r.polled) console.log("[live] polled", r);
    } catch (err) {
      console.error("[live] failed", err);
    }
  });

  // Post-match details drain (scorers/cards) — nightly, fresh budget bucket.
  cron.schedule("0 2,4 * * *", async () => {
    try {
      console.log("[details]", await runDetailsDrain());
    } catch (err) {
      console.error("[details] failed", err);
    }
  });

  console.log("Scheduler started — fixtures 05:00, details 02:00/04:00, live every 2 min.");
}
