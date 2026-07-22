import cron from "node-cron";
import { runCatchUp, standardCatchUp } from "@/lib/catchup";
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
  runPredictionsPoll,
} from "@/lib/poller";
import { runPushNotify } from "@/lib/pushTrigger";
import { cleanupWatched } from "@/lib/surveillance";
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
/** Daily/weekly slots that must survive the machine being asleep at the hour. */
const CATCH_UP = standardCatchUp({
  sync: () => runFixtureSync(memoryCache),
  details: () => runDetailsDrain(40),
  resync: () => runFullResync(memoryCache),
});

// Everything is Paris-local. node-cron resolves the offset itself (it does not
// read the container's tzdata), so the dated jobs fire at the intended local
// hour even though the prod container runs in UTC.
const TZ = { timezone: "Europe/Paris" } as const;

export function startScheduler(): void {
  cron.schedule("0 5 * * *", () => runJob("sync", () => runFixtureSync(memoryCache)), TZ);

  // Weekly full-season re-sync (~10 requests) — catches fixtures scheduled after
  // a draw across the whole calendar, not just the daily rolling window.
  cron.schedule("0 6 * * 1", () => runJob("resync", () => runFullResync(memoryCache)), TZ);

  // Live cadence, every minute: scores, imminent lineups, eager post-match drain.
  // Sequential (not parallel) so the three don't race on the shared budget
  // counter; each is gated to log/record only when it actually did something.
  cron.schedule("* * * * *", async () => {
    await runJob("live", () => runLivePollTick(new Date(), memoryCache), (r) => r.polled);
    await runJob("live-enrich", () => runLiveEnrich(), (r) => r.matches > 0);
    await runJob("push", () => runPushNotify(), (r) => r.fired > 0);
    await runJob("lineups", () => runLineupPoll(), (r) => r.matches > 0);
    await runJob("predictions", () => runPredictionsPoll(), (r) => r.matches > 0);
    await runJob("eager", () => runEagerDrain(), (r) => r.matches > 0);
    // Last: drop surveillance for matches whose post-match tail has settled.
    await runJob("unwatch", () => cleanupWatched(), (r) => r > 0);
    // …and heal any daily/weekly slot the machine slept through (see runCatchUp).
    await runJob("catchup", () => runCatchUp(CATCH_UP), (r) => r.length > 0);
  }, TZ);

  // Nightly deep drain — backstop that also stamps matches the API never enriches
  // (so the eager drain stops chasing them), on a fresh budget bucket.
  cron.schedule("0 2,4 * * *", () => runJob("details", () => runDetailsDrain(40)), TZ);

  log.info("scheduler.started", {
    fixtures: "05:00",
    resync: "Mon 06:00",
    nightlyDrain: "02:00/04:00",
    live: "every minute (scores + lineups + eager drain)",
  });
}
