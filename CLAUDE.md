# Lucarne

Le programme des matchs de football et leur **diffuseur français** (Ligue 1/2, Premier League, Liga, Bundesliga, Champions/Europa/Conference/Nations League, Coupe du Monde). Cible : hébergement **free-tier**. Fuseau : **Europe/Paris**. UI en **anglais** pour l'instant (i18n prévu plus tard — pas de FR hardcodé).

## Monorepo (Turborepo + Bun workspaces, `bun@1.3.13`)

- `apps/api` — API **Hono**, tourne sur **Node** (`src/server.ts`, scheduler node-cron) *et* **Cloudflare Workers** (`src/worker.ts`, Cron Triggers). Données via **API-Football** (api-sports.io v3).
- `apps/web` — SPA **React 19 + Vite + Tailwind v4 + TanStack Router**.
- `packages/shared` (`@lucarne/shared`) — types du contrat wire partagés API↔web. Source de vérité des shapes JSON.

## Commandes (depuis la racine)

```bash
bun run dev          # turbo: api (bun --watch) + web (vite)
bun run typecheck    # tsc --noEmit sur tous les packages
bun run lint         # eslint .            (lint:fix pour --fix)
bun run test         # bun test sur tous les packages
bun run build        # turbo build
bun run --filter @lucarne/web build   # build web seul (rapide à vérifier)
```

Avant de dire qu'une modif est OK : **typecheck + lint + test + build web** doivent passer.

DB (Drizzle) : `bun run db:generate` (migration depuis `apps/api/src/db/schema.ts`), `bun run db:migrate` (applique sur `apps/api/local.db`), `bun run db:seed`. Depuis `apps/api` : `db:backfill-details`, et scripts one-off dans `src/db/`.

## Base de données

**Cloudflare D1** en prod / **bun:sqlite** en local (`apps/api/local.db`). ORM **Drizzle** (`drizzle-orm/sqlite-core`). Migrations dans `apps/api/drizzle/`. En local, appliquer via `db:migrate` ; en prod via `wrangler d1 migrations apply`.

## API-Football & budget

Plan **API-Football Pro** (7 500 req/j). Budget quotidien partagé `DAILY_API_BUDGET = 7000` (voir `apps/api/src/lib/live.ts`, seule constante à changer pour Ultra/Mega). `getFixtures(league, saison, from, to)` = **1 requête par compétition** quelle que soit la plage. Le sync quotidien + le re-sync hebdo pleine saison sont non-budget-gated ; live/lineups/details sont gated (s'arrêtent à 0). Cron live **chaque minute, 24h/24** (`* * * * *`) : scores (~60 s, via `live=all` = 1 req tous matchs) + **enrichissement live** des matchs en cours (events + stats, `stamp:false` → stockés sans tamponner, ~2 req/match live/tick) + compos imminentes + drain « eager » des matchs fraîchement terminés (`stampWhenEmpty:false` → les stats/notes qui sortent après le coup de sifflet sont re-tentées). Drain nocturne 02:00/04:00 = backstop qui tamponne (fetch final autoritaire) les matchs terminés. Le calendrier complet est seedé une fois (`backfill-all`) puis maintenu par cron.

## Conventions

- **Commits** : Conventional Commits (hooks husky : `pre-commit` = lint-staged `eslint --fix`, `commit-msg` = commitlint). **Sujets en minuscules** (pas de sentence-case). Découper le travail en commits logiques.
- Réutiliser les **types de `@lucarne/shared`** de bout en bout.
- **UI en anglais** pour l'instant (i18n plus tard) ; dates via `en-GB`, fuseau `Europe/Paris`. Les touches FastText (R/G/Y/C) suivent la locale.

## ⚠️ Sécurité

La clé API-Football vit **uniquement** dans `apps/api/.env.local` (gitignored). **Ne jamais la committer ni l'afficher en entier.** `local.db` est aussi gitignored. Seul `.env.example` (placeholder) est tracké.

## En cours

Refonte **UI télétexte** en cours et **non committée** — voir la mémoire `teletext-conversion` (design language, fichiers, maquette de référence, reprise). Le dev de l'utilisateur tourne déjà (HMR) : ne pas relancer de serveur.
