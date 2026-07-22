import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "@/db/local";

// Apply generated migrations (drizzle/) to the Postgres at DATABASE_URL.
// A dedicated single-connection client (max: 1), as the migrator expects.
const url = databaseUrl();
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
await sql.end();
console.log(`Migrations applied to ${url.replace(/:[^:@/]+@/, ":****@")}`);
