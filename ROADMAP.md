# Roadmap — Lucarne

Idées d'améliorations, triées par phase. Contraintes qui cadrent chaque choix :
hébergement **free-tier Cloudflare**, budget **API-Football Pro** (7 500 req/j),
UI **télétexte**, **i18n** en/fr, fuseau **Europe/Paris**.

Statut : `[ ]` à faire · `[~]` en cours · `[x]` fait.

## Phase 1 — Perso & mobile (zéro / peu de backend)

- [~] **Équipes favorites + « Mes matchs » (P200)** ⭐
  Store `localStorage` (même pattern que `settings.ts`), un ★ sur les équipes, une
  page qui filtre le planning aux matchs de mes équipes. Débloque tout le reste
  (filtre télé ciblé, .ics ciblé, push ciblé).
- [ ] **« Ce soir à la télé » + filtre diffuseur**
  Vue groupée **par chaîne** (l'USP de l'app), + filtre « je n'ai que Canal+/beIN
  → cache le reste » (`localStorage`).
- [ ] **Export calendrier (.ics)**
  Bouton « Ajouter au calendrier » (un match, ou tous les matchs d'une équipe
  favorite) → iCal généré par le Worker, fuseau Paris + diffuseur en note.
- [ ] **PWA installable**
  Manifest + service worker minimal → installable plein écran sur mobile (le look
  CRT en standalone), cache **hors-ligne** du dernier planning.

## Phase 2 — Données (le plan Pro les rend abordables)

- [ ] **Meilleurs buteurs / passeurs par compétition**
  Sous-page P4xx. `/players/topscorers`, même mécanique que les standings (sync +
  stockage + page). Très télétexte.
- [ ] **Forme récente (5 derniers) + confrontations directes (H2H)**
  Sur la fiche match, avant le coup d'envoi. Enrichit la page d'avant-match.
- [ ] **Bandeau scores live défilant (ticker) + page annuaire P199**
  Ticker télétexte sur l'index ; page annuaire listant toutes les pages.

## Phase 3 — La feature qui claque

- [ ] **Notifications push (« coup d'envoi » / « BUT ! »)**
  Web Push natif ciblé sur les favoris : clés VAPID + abonnements en D1 + envoi
  depuis le cron existant. Entièrement free-tier. Effort moyen-élevé.

## En réserve (à trancher plus tard)

- Recherche floue d'équipe (jump rapide).
- Sous-pages rotatives (le « hold » télétexte).
- Splits domicile / extérieur dans les classements.
