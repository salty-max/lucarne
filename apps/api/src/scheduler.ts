import cron from "node-cron";
import { runJob } from "@/lib/jobs";
import { log } from "@/lib/log";
import {
  runDetailsDrain,
  runEagerDrain,
  runFixtureSync,
  runFullResync,
  runLineupPoll,
  runLiveEnrich,
  runLivePollTick,
} from "@/lib/poller";
import { runPushNotify } from "@/lib/pushTrigger";
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
  cron.schedule("0 5 * * *", () => runJob("sync", () => runFixtureSync(memoryCache)));

  // Weekly full-season re-sync (~10 requests) — catches fixtures scheduled after
  // a draw across the whole calendar, not just the daily rolling window.
  cron.schedule("0 6 * * 1", () => runJob("resync", () => runFullResync(memoryCache)));

  // Live cadence, every minute: scores, imminent lineups, eager post-match drain.
  // Sequential (not parallel) so the three don't race on the shared budget
  // counter; each is gated to log/record only when it actually did something.
  cron.schedule("* * * * *", async () => {
    await runJob("live", () => runLivePollTick(new Date(), memoryCache), (r) => r.polled);
    await runJob("live-enrich", () => runLiveEnrich(), (r) => r.matches > 0);
    await runJob("push", () => runPushNotify(), (r) => r.fired > 0);
    await runJob("lineups", () => runLineupPoll(), (r) => r.matches > 0);
    await runJob("eager", () => runEagerDrain(), (r) => r.matches > 0);
  });

  // Nightly deep drain — backstop that also stamps matches the API never enriches
  // (so the eager drain stops chasing them), on a fresh budget bucket.
  cron.schedule("0 2,4 * * *", () => runJob("details", () => runDetailsDrain(40)));

  log.info("scheduler.started", {
    fixtures: "05:00",
    resync: "Mon 06:00",
    nightlyDrain: "02:00/04:00",
    live: "every minute (scores + lineups + eager drain)",
  });
}
