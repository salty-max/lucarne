import { defineConfig } from "drizzle-kit";

// SQLite (D1 in prod, bun:sqlite locally). `db:generate` emits migrations from
// the schema (no DB needed); apply them with `db:migrate` (local) or
// `wrangler d1 migrations apply` (D1).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  verbose: true,
  strict: true,
});
