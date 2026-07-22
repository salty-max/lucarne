import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * The app's db handle. The concrete connection is injected at the entry point
 * via `setDb()` (server.ts, seed.ts, the db scripts, tests), so this module has
 * no driver import and stays trivially mockable.
 */
export type DB = PostgresJsDatabase<typeof schema>;

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
