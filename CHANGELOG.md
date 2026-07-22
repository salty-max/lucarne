# Changelog

Notable changes to Lucarne. Versioning follows [Semantic Versioning](https://semver.org);
the version shown in the app's **About** dialog comes from `apps/web/package.json`.
Dates are Europe/Paris.

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
