import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import { app } from "@/app";
import { schema, setDb } from "@/db";
import { runJob } from "@/lib/jobs";
import { setLogFormat, setLogLevel } from "@/lib/log";
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
import { pickCache } from "@/lib/scheduleCache";

// Minimal Workers types (D1Database is imported for the driver; the rest stay
// local to avoid pulling @cloudflare/workers-types into the global scope).
type CronEvent = { cron: string; scheduledTime: number };
type ExecCtx = { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void };
type Env = {
  DB: D1Database;
  SCHEDULE_KV?: unknown;
  CURRENT_SEASON?: string;
  LOG_LEVEL?: string;
  LOG_FORMAT?: string;
};

// Must match wrangler.jsonc `triggers.crons` exactly.
const DAILY_SYNC_CRON = "0 5 * * *";
const WEEKLY_RESYNC_CRON = "0 6 * * 1";
const DETAILS_CRON = "0 2,4 * * *";

/**
 * Cloudflare Workers entry point. The D1 binding lives on `env`, so `setDb` is
 * called at the top of each handler before any query runs.
 *
 *   fetch      → the Hono app (JSON APIs); the SPA is served by Static Assets
 *   scheduled  → Cron Triggers: sync (0 5), nightly drain (0 2,4), else live tick
 */
export default {
  fetch(req: Request, env: Env): Response | Promise<Response> {
    setDb(drizzle(env.DB, { schema }));
    setLogLevel(env.LOG_LEVEL);
    setLogFormat(env.LOG_FORMAT);
    // ctx not forwarded — no route uses executionCtx, so avoid the type dance.
    return app.fetch(req, env);
  },

  async scheduled(event: CronEvent, env: Env, ctx: ExecCtx): Promise<void> {
    setDb(drizzle(env.DB, { schema }));
    setLogLevel(env.LOG_LEVEL);
    setLogFormat(env.LOG_FORMAT);
    const cache = pickCache(env);
    if (event.cron === DAILY_SYNC_CRON) {
      ctx.waitUntil(runJob("sync", () => runFixtureSync(cache)));
    } else if (event.cron === WEEKLY_RESYNC_CRON) {
      ctx.waitUntil(runJob("resync", () => runFullResync(cache)));
    } else if (event.cron === DETAILS_CRON) {
      // Nightly deep drain — backstop that also stamps matches the API never
      // enriches, so the eager drain stops chasing them.
      ctx.waitUntil(runJob("details", () => runDetailsDrain(40)));
    } else {
      // Live cadence (every minute): poll live scores, refresh in-play events +
      // stats, grab confirmed lineups for imminent games, and eagerly drain details
      // of freshly-finished ones. Each is gated to log/record only when it actually
      // did something.
      // Sequential (not parallel) so they don't race on the shared budget
      // counter, and so `push` sees the events `live-enrich` just wrote.
      ctx.waitUntil(
        (async () => {
          await runJob("live", () => runLivePollTick(new Date(), cache), (r) => r.polled);
          await runJob("live-enrich", () => runLiveEnrich(), (r) => r.matches > 0);
          await runJob("push", () => runPushNotify(), (r) => r.fired > 0);
          await runJob("lineups", () => runLineupPoll(), (r) => r.matches > 0);
          await runJob("predictions", () => runPredictionsPoll(), (r) => r.matches > 0);
          await runJob("eager", () => runEagerDrain(), (r) => r.matches > 0);
        })(),
      );
    }
  },
};
