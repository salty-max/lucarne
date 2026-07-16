import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { localSqlitePath } from "@/db/local";

// Apply generated migrations (drizzle/) to the local bun:sqlite database.
// (Prod/D1 uses `wrangler d1 migrations apply` — see README.)
const path = localSqlitePath();
const db = drizzle(new Database(path));
migrate(db, { migrationsFolder: "drizzle" });
console.log(`Migrations applied to ${path}`);
