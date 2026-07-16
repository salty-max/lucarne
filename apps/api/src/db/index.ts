import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * One db type across runtimes. The concrete driver is injected at the entry
 * point via `setDb()`:
 *   - Cloudflare Workers → drizzle-orm/d1 with the D1 binding (worker.ts)
 *   - Bun (local/tests/VM) → drizzle-orm/bun-sqlite (server.ts, seed.ts, tests)
 * Both are SQLite; queries are always awaited, so the shared async D1 type fits.
 */
export type DB = DrizzleD1Database<typeof schema>;

let _db: DB | null = null;

export function setDb(instance: DB): void {
  _db = instance;
}

function current(): DB {
  if (!_db) {
    throw new Error("db not initialized — call setDb() at the runtime entry point");
  }
  return _db;
}

/** Lazy proxy so `import { db }` works everywhere; resolves the injected driver. */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = current() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
