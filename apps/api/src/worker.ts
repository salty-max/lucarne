import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import { app } from "@/app";
import { schema, setDb } from "@/db";
import {
  runDetailsDrain,
  runFixtureSync,
  runFullResync,
  runLineupPoll,
  runLivePollTick,
} from "@/lib/poller";
import { pickCache } from "@/lib/scheduleCache";

// Minimal Workers types (D1Database is imported for the driver; the rest stay
// local to avoid pulling @cloudflare/workers-types into the global scope).
type CronEvent = { cron: string; scheduledTime: number };
type ExecCtx = { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void };
type Env = { DB: D1Database; SCHEDULE_KV?: unknown; CURRENT_SEASON?: string };

// Must match wrangler.jsonc `triggers.crons` exactly.
const DAILY_SYNC_CRON = "0 5 * * *";
const WEEKLY_RESYNC_CRON = "0 6 * * 1";
const DETAILS_CRON = "0 2,4 * * *";

/**
 * Cloudflare Workers entry point. The D1 binding lives on `env`, so `setDb` is
 * called at the top of each handler before any query runs.
 *
 *   fetch      → the Hono app (JSON APIs); the SPA is served by Static Assets
 *   scheduled  → Cron Triggers: sync (0 5), details (0 2,4), else live tick
 */
export default {
  fetch(req: Request, env: Env): Response | Promise<Response> {
    setDb(drizzle(env.DB, { schema }));
    // ctx not forwarded — no route uses executionCtx, so avoid the type dance.
    return app.fetch(req, env);
  },

  async scheduled(event: CronEvent, env: Env, ctx: ExecCtx): Promise<void> {
    setDb(drizzle(env.DB, { schema }));
    const cache = pickCache(env);
    if (event.cron === DAILY_SYNC_CRON) {
      ctx.waitUntil(
        runFixtureSync(cache)
          .then((r) => console.log("[sync]", r))
          .catch((err) => console.error("[sync] failed", err)),
      );
    } else if (event.cron === WEEKLY_RESYNC_CRON) {
      ctx.waitUntil(
        runFullResync(cache)
          .then((r) => console.log("[resync]", r))
          .catch((err) => console.error("[resync] failed", err)),
      );
    } else if (event.cron === DETAILS_CRON) {
      ctx.waitUntil(
        runDetailsDrain()
          .then((r) => console.log("[details]", r))
          .catch((err) => console.error("[details] failed", err)),
      );
    } else {
      // Live cadence: poll live scores + grab confirmed lineups for imminent games.
      ctx.waitUntil(
        Promise.allSettled([
          runLivePollTick(new Date(), cache).then((r) => {
            if (r.polled) console.log("[live] polled", r);
          }),
          runLineupPoll().then((r) => {
            if (r.matches) console.log("[lineups] fetched", r);
          }),
        ]).then(() => {}),
      );
    }
  },
};
