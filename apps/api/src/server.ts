import { serveStatic } from "hono/bun";
import { app } from "@/app";
import { initLocalDb } from "@/db/local";
import { log, setLogFormat, setLogLevel } from "@/lib/log";
import { runHistoricalBackfill } from "@/lib/poller";
import { startScheduler } from "@/scheduler";

// Bun runtime entry. Bun auto-loads .env/.env.local and serves the default
// export below. Run with `bun --watch src/server.ts` (dev) or `bun src/server.ts`.

// Use a local bun:sqlite database (SQLITE_PATH, default ./local.db).
initLocalDb();
setLogLevel(process.env.LOG_LEVEL);
setLogFormat(process.env.LOG_FORMAT ?? "pretty"); // terminal-friendly locally; set LOG_FORMAT=json to pipe

// Serves the built SPA (../web/dist) for a Bun/VM deploy. In local dev, Vite
// serves the SPA and proxies /api here; on Workers, Static Assets serve it.
// /api/* routes are already registered on `app`.
app.use("/*", serveStatic({ root: "../web/dist" }));
app.get("*", serveStatic({ path: "../web/dist/index.html" })); // SPA fallback

// In-process scheduler (default on). Set SCHEDULER=off to disable it (e.g. when
// an external trigger drives /api/cron/*).
if (process.env.SCHEDULER !== "off") {
  startScheduler();
  // Fire-and-forget historical catch-up: drain the finished-match backlog behind
  // the already-listening server, so a fresh deploy fills in its history (World
  // Cup, mid-season J1, UEFA play-offs) without a manual pass and without delaying
  // readiness. .catch() so a stray rejection can never take the process down.
  void runHistoricalBackfill().catch((err) => log.error("backfill.crash", { err: String(err) }));
}

const port = Number(process.env.PORT ?? 3000);
console.log(`Lucarne API → http://localhost:${port}`);

export default { port, fetch: app.fetch };
