# Lucarne ⚽

Le programme complet des matchs de football et leur **diffuseur français** (Ligue 1,
Premier League, Liga, Bundesliga, Ligue des Champions / Europa / Conference).

Built to run **entirely on free tiers**, including live-ish scores.

## Monorepo

Turborepo + Bun workspaces.

```
apps/
  api/       Hono JSON API + scheduler — Cloudflare Workers (prod) or Bun (dev/VM)
  web/       React 19 + Vite + Tailwind v4 + shadcn/ui SPA
packages/
  shared/    @lucarne/shared — the API wire contract (types), imported by both
turbo.json   task graph (dev / build / typecheck / deploy)
```

The SPA is served as **Workers Static Assets** (or by the Bun server); `/api/*` runs the
Worker. Both sides import their types from `@lucarne/shared`, so the API contract can't
silently drift.

## Stack

| Layer | Choice |
|---|---|
| Monorepo | **Turborepo** + **Bun** workspaces |
| API + scheduler | **Hono** — Cloudflare Workers (`apps/api/src/worker.ts`) or Bun (`apps/api/src/server.ts`) |
| Frontend | **React 19 + Vite + Tailwind v4 + shadcn/ui** (`apps/web`) |
| Shared | **`@lucarne/shared`** — wire types, one source of truth |
| Scheduler | **Cloudflare Cron Triggers** (free) — or in-process `node-cron` on Bun |
| Live gate | **Workers KV** (in-memory on Bun) so the poller skips the DB when nothing's live |
| Database | **Cloudflare D1** (SQLite) on Workers; **bun:sqlite** locally + in tests |
| ORM | Drizzle (`sqlite-core`) |
| Fixtures / scores | [API-Football](https://www.api-football.com) (api-sports.io v3) |

## The core idea: broadcasters are (mostly) a data table

French TV rights are almost entirely **competition-level**, not match-level. So the
diffuseur for ~6 of 7 competitions resolves from a small, **season-versioned** mapping
(`broadcast_rules`) instead of scraping per match. Only Ligue 1 is split (Ligue 1+ vs
Amazon), handled by per-match `broadcast_overrides`. Channels are **never hardcoded** —
they live in `broadcast_rules` bounded by `[valid_from, valid_to]`.

### 2025-26 mapping (seeded)

| Competition | Diffuseur FR |
|---|---|
| Ligue 1 | Ligue 1+ (8/9) + Amazon Prime Video (affiches) |
| Premier League | CANAL+ |
| La Liga | beIN SPORTS |
| Bundesliga | beIN SPORTS |
| Champions / Europa / Conference | CANAL+ |

## Free-plan data strategy

The free API-Football plan is **100 requests/day** (`DAILY_API_BUDGET`, counted per UTC
day in `sync_state`). Three consumers share it and self-balance:

1. **Fixture sync** (~7/day) — daily.
2. **Live scores** — `fixtures?live=all` (one request, all matches), window-gated + adaptive.
3. **Detailed events** (scorers/cards) — one request *per finished match*, but immutable
   after full-time, so a **budget-capped drain** fetches them lazily overnight (`0 2,4 * * *`)
   in a fresh bucket; any backlog completes on a later run.

**DB gate:** the sync writes the day's match windows to **Workers KV** (in-memory on Bun);
the live tick reads KV first and skips the DB when nothing's live. D1 has no CU-hour
billing (it's per row read/written, with a huge free tier), so this is now just a small
optimisation — fewer D1 reads. A cold cache safely falls back to a DB query.

**Two data paths:** the scheduler → DB spends the API quota; the browser → `/api/live`
reads our own DB every 30s (zero API cost, scales with visitors).

## Setup

```bash
bun install                                   # whole workspace
cp apps/api/.env.example apps/api/.env.local  # API_FOOTBALL_KEY, CRON_SECRET (+ optional SQLITE_PATH)

bun run db:generate                           # emit SQL migrations from the schema
bun run db:migrate                            # apply them to the local bun:sqlite db (./local.db)
bun run db:seed                               # broadcasters + competitions + 2025-26 rules

bun run dev                                   # Turbo: API on :3000 + Vite SPA on :5173
```

Open http://localhost:5173 (Vite proxies `/api` → :3000). Load the first fixtures:

```bash
curl http://localhost:3000/api/cron/fixtures -H "Authorization: Bearer $CRON_SECRET"
```

## Commands (root)

| Command | Does |
|---|---|
| `bun run dev` | API (`bun --watch`) + SPA (Vite), both, via Turbo |
| `bun run typecheck` | tsc across api + web + shared |
| `bun run lint` / `lint:fix` | ESLint (flat config) across the repo |
| `bun run build` | build the SPA |
| `bun run dryrun` | build SPA + `wrangler deploy --dry-run` |
| `bun run deploy` | build SPA + `wrangler deploy` |
| `bun run db:generate` / `db:migrate` / `db:seed` | Drizzle (SQLite), delegated to `@lucarne/api` |

## Tooling & conventions

- **ESLint** — flat config (`eslint.config.mjs`), typescript-eslint + React (hooks /
  refresh) rules. `bun run lint` / `bun run lint:fix`.
- **Husky** git hooks (`.husky/`): **pre-commit** → `lint-staged` (`eslint --fix` on
  staged `.ts`/`.tsx`), **commit-msg** → commitlint. Installed via the `prepare` script.
- **Commitlint** — [Conventional Commits](https://www.conventionalcommits.org)
  (`@commitlint/config-conventional`): `feat: …`, `fix: …`, `chore: …`, etc.
- **Tests** — Bun's built-in runner (`bun test`, Jest-compatible). The web app renders
  with **happy-dom + React Testing Library** (preloaded via `apps/web/bunfig.toml`).

## Testing

```bash
bun run test                       # turbo run test — api + web
bun --filter @lucarne/api test     # one package
bun --filter @lucarne/web test:coverage
```

- **87 tests.** Web coverage ≈ **98% funcs / 99% lines**; the api's pure logic
  (broadcaster resolver, budget/gating, time, status, cache, API client, auth, routes)
  is at/near 100%.
- What's **not** unit-tested by design: the DB-bound glue (`ingest`, the DB paths of
  `poller`/`schedule`/`broadcasters`) and the runtime entry points (`server`, `worker`).
  Those want a real DB — now trivial with SQLite: an **in-memory bun:sqlite** integration
  layer (migrate + seed + `setDb`) is the natural next step.
- Pure logic is extracted for testing (e.g. `broadcasters.resolveForMatch`), and the
  JSON routes are covered via Hono's `app.request()`.

## API routes

| Route | Purpose |
|---|---|
| `GET /` (+ assets) | The React SPA (Static Assets / Bun static — not the Worker) |
| `GET /api/schedule` | Full schedule grouped by Paris day (`ScheduleResponse`) |
| `GET /api/live` | Live scores JSON (SPA polls this; reads our DB) |
| `GET /api/cron/fixtures` | Daily fixture sync (authed) — also on the internal timer |
| `GET /api/cron/live` | One live-poll tick (authed) — also on the internal timer |
| `GET /api/cron/details` | Post-match details drain (authed) — scorers/cards backlog |
| `POST /api/admin/seed` | Idempotent reference-data seed (authed) — seeds D1 in prod |

## Deploy — Cloudflare Workers

```bash
cd apps/api
bun run wrangler d1 create lucarne                      # paste database_id into wrangler.jsonc
bun run wrangler d1 migrations apply lucarne --remote   # create tables in D1
bun run wrangler kv namespace create SCHEDULE_KV        # paste id into wrangler.jsonc
bun run wrangler secret put API_FOOTBALL_KEY
bun run wrangler secret put CRON_SECRET                 # only if you also hit /api/cron/*
cd ../.. && bun run deploy                               # builds SPA + wrangler deploy
```

- SPA (`apps/web/dist`) → Workers Static Assets; `/api/*` runs the Worker (`run_worker_first`).
- **D1** is the `DB` binding; **KV** is `SCHEDULE_KV`. `wrangler.jsonc` `migrations_dir`
  points at `drizzle/`, so `db:generate` output is what `d1 migrations apply` runs.
- Seed the reference data into D1 once (broadcasters/competitions/rules) via the authed
  endpoint (same `runSeed` logic as local `db:seed`, running where the D1 binding lives):
  `curl -X POST https://<your-worker>/api/admin/seed -H "Authorization: Bearer $CRON_SECRET"`.
  The fixture sync fills matches.
- **Cron Triggers** drive sync + details + live via the Worker's `scheduled` handler.
- Other env/secrets reach code via `process.env` (`nodejs_compat`): `CURRENT_SEASON` is a
  var; `API_FOOTBALL_KEY` / `CRON_SECRET` are secrets. No DB connection string.

**Alt: Bun host** (Koyeb / Oracle Always Free / VM). `bun run build` then, in `apps/api`,
`bun src/server.ts` — same app with the in-process `node-cron` scheduler serving
`../web/dist`. `SCHEDULER=off` disables the internal timer.

## Data sources / rights

Broadcaster mapping compiled from public 2025-26 rights info
([Selectra](https://selectra.info/telecom/tv/sport),
[UEFA](https://fr.uefa.com/uefachampionsleague/),
Wikipédia « Football à la télévision en France »). Verify each season — update
`apps/api/src/db/seed.ts` and re-run `bun run db:seed`.
