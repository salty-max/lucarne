# Roadmap — Lucarne

Idées d'améliorations, triées par phase. Contraintes qui cadrent chaque choix :
hébergement **free-tier Cloudflare**, budget **API-Football Pro** (7 500 req/j),
UI **télétexte**, **i18n** en/fr, fuseau **Europe/Paris**.

Statut : `[ ]` à faire · `[~]` en cours · `[x]` fait.

## Phase 1 — Perso & mobile (zéro / peu de backend)

- [x] **Équipes favorites — « Mes équipes » (P200)** ⭐
  Store `localStorage` (`favorites.ts`) + endpoint `/api/teams`. La P200 est une
  page de **gestion pure** : recherche pour ajouter une équipe, ★ pour retirer —
  le **seul** endroit pour gérer les favoris (pas d'étoile ailleurs). Les matchs
  des équipes suivies restent sur Today/Calendrier. Débloque le reste (filtre télé
  ciblé, .ics ciblé, push ciblé).
- [x] **« Ce soir à la télé » + filtre diffuseur**
  P600 (Diffuseurs) réécrite : matchs du jour **groupés par chaîne** + filtre
  « mes chaînes » persistant (`localStorage`, `channels.ts`). Guide statique en
  repli les jours sans match.
- [ ] **Export calendrier (.ics)**
  Bouton « Ajouter au calendrier » (un match, ou tous les matchs d'une équipe
  favorite) → iCal généré par le Worker, fuseau Paris + diffuseur en note.
- [x] **Adaptation mobile 100 %** *(prérequis PWA)*
  Audit à 375px : pitch des compos **vertical en mobile** (plus de joueurs coupés),
  indice clavier masqué au tactile, labels FastText resserrés, section stats vide
  masquée. Zéro débordement horizontal sur toutes les pages.
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
