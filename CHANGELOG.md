# Changelog

Notable changes to Lucarne. Versioning follows [Semantic Versioning](https://semver.org);
the version shown in the app's **About** dialog comes from `apps/web/package.json`.
Dates are Europe/Paris.

## [0.3.0] — 2026-07-23

### Added

- A competition filter (the single-select chip row from the calendar) on **Direct**
  and **Radar** — extracted into a shared component and reused across all three.

### Changed

- **Radar** is now grouped: a LIVE section on top, then one section per upcoming
  day, each sub-grouped by competition (was a flat live/upcoming list sorted only
  by kickoff).

## [0.2.2] — 2026-07-23

### Fixed

- "My teams" search now finds teams from a newly added competition (e.g. the J3
  League) without reinstalling the PWA. The team list was cached hard for 30 min;
  it now uses the default staleTime + refetch-on-focus, like the competition list.

## [0.2.1] — 2026-07-23

### Fixed

- The update banner now actually surfaces. The service worker re-checks for a new
  deploy on a 30-min timer and whenever the app regains focus or comes back online,
  instead of only at a cold start — so an installed PWA that stays open no longer
  gets stuck on an old build.

## [0.2.0] — 2026-07-23

Everything since the first production deploy.

### Added

- J3 League (Japan).
- YouTube (J.League International) as a J1 broadcaster.
- App version + build date in the **About** dialog, and an "update available" prompt so an
  installed PWA can reload into a new build with a tap.

### Changed

- The **Direct** page groups matches by competition, with sub-headers, in the canonical order.
- A match with no known broadcaster shows nothing instead of a "to be confirmed" placeholder.

### Fixed

- The calendar day selector no longer shifts the page while loading.
- The competition list refetches when the app regains focus, so a newly added competition
  (e.g. J3) appears without reinstalling the PWA.

## [0.1.0] — 2026-07-22

First production release, deployed on Northflank.

### Added

- Teletext / Antiope revival UI: CEPT-1 + alt palettes, CRT filter, retro/modern fonts,
  FastText navigation, boot splash.
- Fixtures and the French broadcaster for Ligue 1/2, Premier League, La Liga, Bundesliga,
  the Champions/Europa/Conference/Nations League, the World Cup, and the J1 League (Japan).
- Live scores every minute with in-play enrichment (scorers, stats, ratings) and stoppage
  time (90+X); predictions, top scorers/assists, and man of the match.
- Per-device surveillance driving live enrichment and web-push alerts (goals, cards, kickoff,
  full-time).
- Installable PWA, bilingual FR/EN.
- Support links (Ko-fi, GitHub).

### Infrastructure

- Postgres (Cloudflare D1 → Postgres migration), a single monolith Docker image, self-seeding
  on boot, and a background historical backfill.
