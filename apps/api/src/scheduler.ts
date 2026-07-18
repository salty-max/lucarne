import cron from "node-cron";
import {
  runDetailsDrain,
  runEagerDrain,
  runFixtureSync,
  runFullResync,
  runLineupPoll,
  runLivePollTick,
} from "@/lib/poller";
import { memoryCache } from "@/lib/scheduleCache";

/**
 * In-process scheduler. Because Lucarne runs as a long-lived Node process, we
 * don't need any platform cron (and thus dodge Vercel Hobby's once-a-day limit):
 *
 *   - fixtures: synced once a day (~17 API requests, incl. standings)
 *   - live: a tick every minute, but window-gated + budget-throttled inside
 *     runLivePollTick(), so idle ticks cost ZERO API-Football requests. The same
 *     tick grabs imminent lineups and eagerly drains freshly-finished games.
 */
export function startScheduler(): void {
  cron.schedule("0 5 * * *", async () => {
    try {
      console.log("[sync]", await runFixtureSync(memoryCache));
    } catch (err) {
      console.error("[sync] failed", err);
    }
  });

  // Weekly full-season re-sync (~10 requests) — catches fixtures scheduled after
  // a draw across the whole calendar, not just the daily rolling window.
  cron.schedule("0 6 * * 1", async () => {
    try {
      console.log("[resync]", await runFullResync(memoryCache));
    } catch (err) {
      console.error("[resync] failed", err);
    }
  });

  cron.schedule("* * * * *", async () => {
    try {
      const r = await runLivePollTick(new Date(), memoryCache);
      if (r.polled) console.log("[live] polled", r);
    } catch (err) {
      console.error("[live] failed", err);
    }
    try {
      const l = await runLineupPoll();
      if (l.matches) console.log("[lineups] fetched", l);
    } catch (err) {
      console.error("[lineups] failed", err);
    }
    try {
      const d = await runEagerDrain();
      if (d.matches) console.log("[details] eager", d);
    } catch (err) {
      console.error("[details] eager failed", err);
    }
  });

  // Nightly deep drain — backstop that also stamps matches the API never enriches
  // (so the eager drain stops chasing them), on a fresh budget bucket.
  cron.schedule("0 2,4 * * *", async () => {
    try {
      console.log("[details]", await runDetailsDrain(40));
    } catch (err) {
      console.error("[details] failed", err);
    }
  });

  console.log(
    "Scheduler started — fixtures 05:00, full re-sync Mon 06:00, nightly drain 02:00/04:00, live every minute (scores + lineups + eager drain).",
  );
}
