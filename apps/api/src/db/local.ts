import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { setDb, schema, type DB } from "@/db";

// The app's Postgres connection, from DATABASE_URL. Imported by server.ts,
// seed.ts and the db scripts. Kept named initLocalDb so its callers did not
// change across the sqlite→postgres move; "local" now just means "this process's
// db handle", pointed at whatever DATABASE_URL says (a docker Postgres in dev,
// the managed Postgres in prod).

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "postgres://lucarne:lucarne@localhost:5432/lucarne";
}

/** Open a Postgres connection and register it as the app's db. Returns the raw
 *  client so scripts/tests can close it (`await sql.end()`) and let the process
 *  exit — postgres.js holds the pool open otherwise. */
export function initLocalDb(url = databaseUrl()): ReturnType<typeof postgres> {
  const sql = postgres(url, { onnotice: () => {} }); // quiet the idempotent NOTICEs
  setDb(drizzle(sql, { schema }) as unknown as DB);
  return sql;
}
