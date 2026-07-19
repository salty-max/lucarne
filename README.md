# Lucarne ⚽

The complete schedule of football fixtures and their **French TV broadcaster** — Ligue 1 &
2, the Premier League, La Liga, the Bundesliga, the Champions / Europa / Conference /
Nations League, and the World Cup.

The infrastructure runs on **free-tier hosting** (Cloudflare Workers + D1); the one paid
dependency is **API-Football**, since the current season isn't available on its free plan.
All times **Europe/Paris**.

> The UI is a faithful revival of broadcast **teletext / Antiope**: a 40-column grid, the
> seven pure colours, FastText navigation, and a self-hosted teletext typeface.

## Why teletext?

Before smartphones — before the web, even — teletext was how a generation checked the
football. Pages of text and blocky colour were broadcast in the hidden lines of the TV
signal; you keyed a three-digit number into the remote and waited for your page to come
round. Britain had Ceefax and ORACLE; France had **Antiope** (and its videotex cousin,
**Minitel**). Football had its own well-worn pages — live scores, fixtures, tables — drawn
on a 40-column, seven-colour grid. It was instant, weightless and free of clutter: no ads,
no banners, no autoplay. Just the score.

The medium is gone (Ceefax signed off in 2012), but the *format* was quietly perfect for
one job: telling you what's on and how it's going, as fast as possible.

**Lucarne** rebuilds that idea for today's football and today's free-tier web. The name is
a wink — in French, *lucarne* is both a small window (here, onto the day's matches) and the
top corner of the goal, where the best shots finish. The aim is deliberately narrow: open
the app and, at a glance, know **what's playing, when, and on which French channel** — with
live scores, lineups and the essentials one tap away, and nothing you didn't ask for. The
teletext look isn't nostalgia for its own sake; it's the discipline that fits the job:
dense, legible, fast, and light enough to run on a shoestring.

## Features

- **Fixtures & broadcasters** — every competition's schedule, each match tagged with its
  French broadcaster(s).
- **Live** — minute-by-minute scores, goals, cards, lineups, stats and player ratings.
- **Match detail** — pre-match win-probability prediction, live events, lineups on the
  pitch, statistics, referee, and the man of the match.
- **Rankings** — top scorers and assists per competition.
- **Radar (surveillance)** — flag the matches you care about; only those get live
  enrichment and push alerts, which keeps the API budget sane on 50-match days.
- **Web push** — goals (with the scorer's name), cards, kickoff, half-time, full-time,
  man of the match — each notification titled with the fixture so simultaneous alerts from
  different matches stay distinct.
- **Themes** — CEPT-1 (authentic teletext), Neon, Monochrome, Game Boy, Minitel, and a
  light Newsprint theme; optional CRT scanline effect; retro or modern typeface.
- **Teletext navigation** — type a 3-digit page number, use the R/G/Y/C FastText keys, or
  arrow through items, like a real set.
- **Installable PWA** — offline app shell, home-screen install, push on iOS 16.4+.
- **i18n** — French and English.

## Monorepo

Turborepo + Bun workspaces.

```
apps/
  api/       Hono JSON API + scheduler — Cloudflare Workers (prod) or Bun (dev/VM)
  web/       React 19 + Vite + Tailwind v4 + TanStack Router SPA (teletext UI, PWA)
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
| Monorepo | **Turborepo** + **Bun** workspaces (`bun@1.3.13`) |
| API + scheduler | **Hono** — Cloudflare Workers (`apps/api/src/worker.ts`) or Bun (`apps/api/src/server.ts`) |
| Frontend | **React 19 + Vite + Tailwind v4 + TanStack Router/Query** (`apps/web`), `vite-plugin-pwa` |
| Shared | **`@lucarne/shared`** — wire types, one source of truth |
| Scheduler | **Cloudflare Cron Triggers** (free) — or in-process `node-cron` on Bun |
| Database | **Cloudflare D1** (SQLite) on Workers; **bun:sqlite** locally + in tests |
| ORM | Drizzle (`sqlite-core`) |
| Fixtures / scores | [API-Football](https://www.api-football.com) (api-sports.io v3) |

## The core idea: broadcasters are (mostly) a data table

French TV rights are almost entirely **competition-level**, not match-level. So the
broadcaster for ~6 of 7 competitions resolves from a small, **season-versioned** mapping
(`broadcast_rules`) instead of scraping per match. Only Ligue 1 is split (Ligue 1+ vs
Amazon), handled by per-match `broadcast_overrides`. Channels are **never hardcoded** —
they live in `broadcast_rules` bounded by `[valid_from, valid_to]`.

### 2025-26 mapping (seeded)

| Competition | French broadcaster |
|---|---|
| Ligue 1 | Ligue 1+ (8 of 9) + Amazon Prime Video (marquee matches) |
| Premier League | CANAL+ |
| La Liga | beIN SPORTS |
| Bundesliga | beIN SPORTS |
| Champions / Europa / Conference | CANAL+ |

## Data strategy & API budget

The app runs on a shared **daily API-Football budget** (`DAILY_API_BUDGET`, counted per
day in `sync_state`; `7000` on the Pro plan — the one constant to change for another tier).
Consumers self-balance under it:

1. **Fixture sync** — the full schedule, once per competition; daily, plus a weekly
   full-season resync. Not budget-gated.
2. **Live scores** — `fixtures?live=all` is **one request for all live matches**, run
   every minute, 24/7.
3. **Live enrichment** — events, stats, lineups, predictions and player ratings, but
   **only for surveilled matches** (see Radar), so the budget scales with attention, not
   with the fixture list.
4. **Overnight drain** — post-match stats/ratings that land after the whistle are
   re-fetched by a budget-capped nightly drain (`0 2,4 * * *`).

A **reserve floor** (`LIVE_BUDGET_RESERVE = 1500`) guarantees the per-minute score poll
never starves even on a 50+ match day: enrichment/lineups/predictions stop at the reserve,
the score poll never does.

**Two data paths:** the scheduler → DB spends the API quota; the browser → `/api/live`
reads our own DB (zero API cost, scales with visitors).

## Setup

```bash
bun install                                   # whole workspace
cp apps/api/.env.example apps/api/.env.local  # set API_FOOTBALL_KEY, CRON_SECRET
                                              # (VAPID_* optional — only for web push)

bun run db:generate                           # emit SQL migrations from the schema
bun run db:migrate                            # apply them to the local bun:sqlite db
bun run db:seed                               # broadcasters + competitions + 2025-26 rules

bun run dev                                   # Turbo: API on :3000 + Vite SPA on :5173
```

Open http://localhost:5173 (Vite proxies `/api` → :3000). Load the first fixtures:

```bash
curl http://localhost:3000/api/cron/fixtures -H "Authorization: Bearer $CRON_SECRET"
```

Vite also listens on `0.0.0.0`, so you can open `http://<your-mac-ip>:5173` from a phone on
the same Wi-Fi to test the installable PWA.

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

Before calling a change done: **typecheck + lint + test + web build** must pass.

## Tooling & conventions

- **ESLint** — flat config (`eslint.config.mjs`), typescript-eslint + React (hooks /
  refresh) rules.
- **Husky** git hooks (`.husky/`): **pre-commit** → `lint-staged` (`eslint --fix` on staged
  `.ts`/`.tsx`), **commit-msg** → commitlint. Installed via the `prepare` script.
- **Commitlint** — [Conventional Commits](https://www.conventionalcommits.org), **lowercase
  subjects** (`feat: …`, `fix: …`, `chore: …`).
- Reuse `@lucarne/shared` types end to end.

## Testing

```bash
bun run test                       # turbo run test — api + web
bun --filter @lucarne/api test     # one package
```

- **Bun's built-in runner** (Jest-compatible). Web components render with happy-dom +
  React Testing Library.
- Pure logic is extracted for testing (broadcaster resolver, budget/gating, time, status,
  cache, API client, auth) and the JSON routes are covered via Hono's `app.request()`.
- **`bun --filter @lucarne/api db:sim`** drives the *real* poller jobs against a mocked
  API through a full match lifecycle (kickoff → goals → cards → HT → full-time → ratings),
  asserting the DB and push at each step — the regression net for any poll/notify change.

## API routes

| Route | Purpose |
|---|---|
| `GET /api/schedule` | Full schedule grouped by Paris day |
| `GET /api/match/:id` | One match's detail (events, lineups, stats, prediction, MOTM) |
| `GET /api/competitions` · `GET /api/competition/:slug` | Competition list / detail (standings, top scorers & assists) |
| `GET /api/live` | Live scores JSON (the SPA polls this; reads our DB) |
| `GET /api/teams` | Teams (for the follow hub) |
| `GET /api/push/key` · `POST /api/push/subscribe` · `POST /api/push/unsubscribe` | Web-push subscription |
| `GET /api/watch` · `POST /api/watch` | Per-device surveillance (radar) state |
| `GET /api/cron/{fixtures,live,lineups,details,resync}` | Scheduler ticks (authed) — also on the internal timer |
| `GET /api/logs` | Recent scheduled-job runs |
| `POST /api/admin/{seed,backfill-details}` | Idempotent reference-data seed / detail backfill (authed) |

## Deploy — Cloudflare Workers

```bash
cd apps/api
bun run wrangler d1 create lucarne                      # paste database_id into wrangler.jsonc
bun run wrangler d1 migrations apply lucarne --remote   # create tables in D1
bun run wrangler secret put API_FOOTBALL_KEY
bun run wrangler secret put CRON_SECRET                 # if you also hit /api/cron/*
# For web push, also:
bun run wrangler secret put VAPID_PUBLIC_KEY
bun run wrangler secret put VAPID_PRIVATE_KEY
bun run wrangler secret put VAPID_SUBJECT
cd ../.. && bun run deploy                               # builds SPA + wrangler deploy
```

- SPA (`apps/web/dist`) → Workers Static Assets; `/api/*` runs the Worker.
- **D1** is the `DB` binding. `wrangler.jsonc` `migrations_dir` points at `drizzle/`, so
  `db:generate` output is what `d1 migrations apply` runs.
- Seed the reference data into D1 once (broadcasters/competitions/rules):
  `curl -X POST https://<your-worker>/api/admin/seed -H "Authorization: Bearer $CRON_SECRET"`.
  The fixture sync fills the matches.
- **Cron Triggers** drive sync + live + enrichment + drain via the Worker's `scheduled`
  handler.

**Alt: Bun host** (Koyeb / Oracle Always Free / VM). `bun run build` then, in `apps/api`,
`bun src/server.ts` — same app with the in-process `node-cron` scheduler serving
`../web/dist`. `SCHEDULER=off` disables the internal timer.

## Data sources / rights

Broadcaster mapping compiled from public 2025-26 rights info. Verify each season — update
`apps/api/src/db/seed.ts` and re-run `bun run db:seed`.

## Security

Secrets (`API_FOOTBALL_KEY`, `CRON_SECRET`, the `VAPID_*` keys) live **only** in
`apps/api/.env.local` (git-ignored) locally, and as Wrangler secrets in production — never
in the repo. `local.db` is git-ignored too; only `.env.example` (placeholders) is tracked.

## License

[MIT](LICENSE) © 2026 salty-max
