import { serveStatic } from "hono/bun";
import { app } from "@/app";
import { initLocalDb } from "@/db/local";
import { startScheduler } from "@/scheduler";

// Bun runtime entry. Bun auto-loads .env/.env.local and serves the default
// export below. Run with `bun --watch src/server.ts` (dev) or `bun src/server.ts`.

// Use a local bun:sqlite database (SQLITE_PATH, default ./local.db).
initLocalDb();

// Serves the built SPA (../web/dist) for a Bun/VM deploy. In local dev, Vite
// serves the SPA and proxies /api here; on Workers, Static Assets serve it.
// /api/* routes are already registered on `app`.
app.use("/*", serveStatic({ root: "../web/dist" }));
app.get("*", serveStatic({ path: "../web/dist/index.html" })); // SPA fallback

// In-process scheduler (default on). Set SCHEDULER=off to disable it (e.g. when
// an external trigger drives /api/cron/*).
if (process.env.SCHEDULER !== "off") startScheduler();

const port = Number(process.env.PORT ?? 3000);
console.log(`Lucarne API → http://localhost:${port}`);

export default { port, fetch: app.fetch };
