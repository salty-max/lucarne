import { Database } from "bun:sqlite";
import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { initLocalDb } from "@/db/local";

/**
 * One-off: copy every row from the old bun:sqlite local.db into the new
 * Postgres, so the backfilled fixtures + enriched matches are not re-fetched
 * from API-Football. Run once, after `db:migrate` has created the Postgres
 * schema:
 *
 *   SQLITE_SRC=apps/api/local.db bun run src/db/migrate-from-sqlite.ts
 *
 * Idempotent-ish: it inserts, so run it against an EMPTY Postgres. Conversions
 * are driven by each column's Drizzle type, so there is no per-table mapping to
 * drift: sqlite epoch-ms ints → Date, 0/1 → boolean, json text → object.
 */

const SRC = process.env.SQLITE_SRC ?? "local.db";
const BATCH = 500; // keep each insert well under Postgres's 65535-param ceiling

// FK order: parents before children, so references resolve.
const ORDER: { table: PgTable; hasSerialId: boolean }[] = [
  { table: schema.broadcasters, hasSerialId: true },
  { table: schema.competitions, hasSerialId: true },
  { table: schema.teams, hasSerialId: true },
  { table: schema.matches, hasSerialId: true },
  { table: schema.matchEvents, hasSerialId: true },
  { table: schema.matchLineups, hasSerialId: true },
  { table: schema.standings, hasSerialId: true },
  { table: schema.broadcastRules, hasSerialId: true },
  { table: schema.broadcastOverrides, hasSerialId: true },
  { table: schema.syncState, hasSerialId: false },
  { table: schema.runLog, hasSerialId: true },
  { table: schema.pushSubscription, hasSerialId: false },
  { table: schema.followedTeam, hasSerialId: true },
  { table: schema.pushNotified, hasSerialId: false },
  { table: schema.watchedMatch, hasSerialId: true },
  { table: schema.topPlayers, hasSerialId: false },
];

const sqlite = new Database(SRC, { readonly: true });
const client = initLocalDb();

function sqliteName(table: PgTable): string {
  // Drizzle stores the SQL name on a well-known symbol.
  return (table as unknown as Record<symbol, string>)[
    Object.getOwnPropertySymbols(table).find((s) => s.description === "drizzle:Name")!
  ];
}

/** Convert one sqlite raw value to what the Postgres column wants. */
function convert(columnType: string, value: unknown): unknown {
  if (value == null) return null;
  switch (columnType) {
    case "PgTimestamp":
    case "PgTimestampString": {
      // sqlite is dynamically typed and this app's history left kickoff stored
      // two ways: epoch-ms integers for most rows, ISO strings for ~150. Handle
      // both, and fail loudly rather than write an Invalid Date.
      const s = String(value).trim();
      const d = /^\d+$/.test(s) ? new Date(Number(s)) : new Date(s);
      if (Number.isNaN(d.getTime())) throw new Error(`bad timestamp value ${JSON.stringify(value)}`);
      return d;
    }
    case "PgBoolean":
      return Boolean(value);
    case "PgJsonb":
    case "PgJson":
      return typeof value === "string" ? JSON.parse(value) : value;
    default:
      return value;
  }
}

// Empty every target table first, so this is safe to re-run (e.g. after fixing
// a conversion). RESTART IDENTITY resets the serial sequences too.
const names = ORDER.map(({ table }) => `"${sqliteName(table)}"`).join(", ");
await db.execute(sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`));

let grandTotal = 0;
for (const { table, hasSerialId } of ORDER) {
  const name = sqliteName(table);
  const cols = getTableColumns(table);
  const rows = sqlite.query(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];

  if (rows.length === 0) {
    console.log(`  ${name.padEnd(20)} 0`);
    continue;
  }

  const mapped = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [key, col] of Object.entries(cols)) {
      o[key] = convert(col.columnType, r[col.name]);
    }
    return o;
  });

  for (let i = 0; i < mapped.length; i += BATCH) {
    await db.insert(table).values(mapped.slice(i, i + BATCH));
  }

  // A serial id inserted explicitly does not advance its sequence; reset it so
  // the next natural insert does not collide with a copied id.
  if (hasSerialId) {
    await db.execute(
      sql`SELECT setval(pg_get_serial_sequence(${name}, 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${sql.identifier(name)}))`,
    );
  }

  console.log(`  ${name.padEnd(20)} ${rows.length}`);
  grandTotal += rows.length;
}

console.log(`Copied ${grandTotal} rows from ${SRC} into Postgres.`);
sqlite.close();
await client.end();
process.exit(0);
