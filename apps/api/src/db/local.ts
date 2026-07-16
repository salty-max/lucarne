import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { setDb, schema, type DB } from "@/db";

// Bun-only local/test driver. Imported by server.ts / seed.ts / migrate.ts /
// tests — never by worker.ts, so bun:sqlite stays out of the Workers bundle.

export function localSqlitePath(): string {
  return process.env.SQLITE_PATH ?? "local.db";
}

/** Open a bun:sqlite database and register it as the app's db. */
export function initLocalDb(path = localSqlitePath()): Database {
  const sqlite = new Database(path);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  setDb(drizzle(sqlite, { schema }) as unknown as DB);
  return sqlite;
}
