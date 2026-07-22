# Mise en prod — Lucarne

Guide pas-à-pas, sans prérequis dev-ops. Lucarne se déploie comme **une seule
image Docker** (le serveur Hono sert la SPA + l'API + le cron sur un port) sur
**Northflank**, en free-tier — coût : **0 €** (le seul abonnement payant, c'est
API-Football Pro, que tu as déjà).

- **Ce qu'on déploie** : 1 **service** Northflank (l'image du `Dockerfile`) +
  1 **addon Postgres**. Ça rentre pile dans le free-tier (2 services / 1 base).
- **Pourquoi Northflank et pas Vercel** : le cron live tourne **chaque minute,
  24/7** dans le process Node. Vercel est serverless (cron Hobby = 1×/jour max) ;
  il faut un compute **always-on**, ce que Northflank offre gratuitement (« no
  sleeping »). Son Postgres est aussi always-on, donc pas de compteur d'heures.
- **Le front n'a pas besoin de Vercel** : le serveur le sert déjà depuis
  `apps/web/dist` (mêmes origines → les appels `/api/*` relatifs marchent tels
  quels).

> 🔑 **Sécurité** : les secrets (`API_FOOTBALL_KEY`, `VAPID_PRIVATE_KEY`,
> `CRON_SECRET`) se collent dans l'UI Northflank comme **secret env vars** et ne
> finissent **jamais** dans git ni dans l'image. C'est **toi** qui les saisis
> (depuis `apps/api/.env.local`) — personne d'autre n'y touche. Le `DATABASE_URL`
> est fourni par l'addon (pas un secret à inventer).

> ⚠️ Le free-tier Northflank est estampillé « sandbox / non-prod » et **demande
> une carte bancaire** à l'activation (ce n'est pas un tier sans engagement).
> C'est aussi un risque de dépréciation (cf. Koyeb) : garde des **sauvegardes**
> de la base (`scripts/backup.sh` vers R2) pour pouvoir repartir ailleurs.

---

## Option 1 (recommandée) : MEP en Infrastructure-as-Code

Tout le stack — projet + addon Postgres + service — est décrit dans
[`northflank.template.json`](northflank.template.json) : **un seul apply**,
reproductible et versionné. Les secrets ne sont **pas** dans le fichier (ils
passent en `arguments` au moment du run).

```bash
# 1. CLI + connexion (token : dashboard → Account → API tokens)
npm i -g @northflank/cli
northflank login -t <API_TOKEN>

# 2. Pré-vol : confirme contre TON compte les 3 champs qui varient, et corrige
#    le template si besoin (voir « À confirmer » plus bas) :
northflank get addon-types        # slug Postgres exact ("postgresql") + versions
northflank list plans             # ids de plan (nf-compute-20, buildPlan…)

# 3. Applique le template (renseigne les secrets en arguments au run)
northflank run template -f ./northflank.template.json
#   → API_FOOTBALL_KEY, VAPID_*, CRON_SECRET : saisis-les ici, pas dans le fichier.
```

Ce que le template câble tout seul :
- **`DATABASE_URL`** : le `SecretGroup` aliase le `POSTGRES_URI` de l'addon →
  `DATABASE_URL` (via `addonDependencies`). Aucun copier-coller.
- **Port** : `internalPort: 3000` (Northflank **n'injecte pas** `PORT`, donc le
  serveur retombe sur 3000) exposé en HTTPS public → URL `…code.run`.
- **CI** : `disabledCI: false` → chaque push sur `main` rebuild + redeploy.
- **Migrations** : appliquées au boot par le `CMD` de l'image.

Ensuite → **amorce les données** (section « Amorcer les données » plus bas).

### À confirmer au 1er apply (sinon l'apply peut échouer)
- **Slug + version de l'addon** : `"postgresql"` / `"latest"` — vérifie via
  `northflank get addon-types` (certains comptes veulent `"postgres"` ou une
  version épinglée type `"16-latest"`).
- **Ids de plan** : `nf-compute-20` (0.2 vCPU / 512 Mo, un cran au-dessus du plus
  petit pour laisser respirer Bun + migrations + cron) et `buildPlan` — confirme
  via `northflank list plans`.
- **TLS interne** : le template met `tlsEnabled: false` (base **interne** au
  projet, réseau privé) pour un `DATABASE_URL` sans histoire de `sslmode`. Si tu
  préfères TLS, passe-le à `true` et ajoute `?sslmode=require` à l'alias.
- **Healthcheck** : volontairement **absent** du template (le schéma exact du
  bloc `healthChecks` casse l'apply s'il est mal niché) — ajoute-le ensuite dans
  l'UI (service → Health, sonde HTTP `GET /`, de préférence en *startup probe*
  car les migrations au boot peuvent dépasser 30 s).

Le reste de ce guide (**Option 2**) fait exactement la même chose **à la main
dans le dashboard** — utile pour comprendre, ou si tu ne veux pas de CLI.

---

## Option 2 : à la main dans le dashboard

Le même résultat, cliqué à la main — utile pour comprendre ce que fait le
template, ou si tu ne veux pas de CLI.

### 0. Prérequis

- Un compte **Northflank** (gratuit) : https://northflank.com
- Le repo **GitHub** `salty-max/lucarne` (déjà là) — Northflank build depuis lui.
- Le `Dockerfile` à la racine (déjà là) — rien à écrire.

### 1. Créer le projet + l'addon Postgres

1. Dans Northflank : **Create project** (choisis une région proche, ex. Europe).
2. **Add addon → PostgreSQL** (la « 1 free database »). Laisse la version par
   défaut. Une fois prêt, ouvre l'onglet **Connection details** : tu y trouves
   l'URI de connexion **interne** (celle en `.internal` / réseau privé du projet).
   Garde-la sous la main pour l'étape 3.

### 2. Générer les secrets

- **CRON_SECRET** (protège les routes `/api/admin/*` et `/api/cron/*`) :
  ```bash
  openssl rand -hex 32
  ```
- **VAPID** : réutilise les 3 valeurs déjà dans `apps/api/.env.local`
  (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Pas besoin d'en
  régénérer — sinon les navigateurs déjà abonnés perdraient leurs notifications.
- **API_FOOTBALL_KEY** : la même que dans `.env.local`.

### 3. Créer le service (build + deploy depuis le repo)

1. **Add service → Combined service** (build **et** run au même endroit).
2. **Source** : connecte GitHub, choisis `salty-max/lucarne`, branche `main`.
3. **Build** : type **Dockerfile**, chemin `./Dockerfile`, contexte `.` (racine).
4. **Networking / Ports** : expose le port **3000** en HTTP (public). Northflank
   te donnera une URL `https://<service>--<project>.<region>.northflank.app` et
   injecte `PORT` — le serveur lit `PORT ?? 3000`, donc ça tombe juste.
5. **Ressources** : le plus petit plan suffit largement (l'app est légère).

### 4. Poser les variables d'environnement

Sur le service, onglet **Environment** (marque les 3 secrets comme *secret*) :

| Variable | Valeur | Secret ? |
|---|---|---|
| `DATABASE_URL` | l'URI **interne** de l'addon (étape 1). Ajoute `?sslmode=require` si la connexion refuse en clair. | — |
| `API_FOOTBALL_KEY` | ta clé API-Football | ✅ |
| `VAPID_PUBLIC_KEY` | depuis `.env.local` | — |
| `VAPID_PRIVATE_KEY` | depuis `.env.local` | ✅ |
| `VAPID_SUBJECT` | ex. `mailto:toi@exemple.fr` | — |
| `CRON_SECRET` | le token de l'étape 2 | ✅ |
| `CURRENT_SEASON` | ex. `2026` | — |
| `LOG_FORMAT` | `json` (logs structurés pour le viewer) | — |

> Le fuseau est géré **dans le code** (node-cron reçoit `Europe/Paris`), donc pas
> besoin de `TZ` sur le conteneur même s'il tourne en UTC.

### 5. Déployer

Lance le build. Au démarrage, l'image fait `db:migrate && start` : sur une base
**vierge**, les migrations créent tout le schéma **avant** que le serveur prenne
du trafic (c'est idempotent, un redémarrage est sans risque).

👉 **Note l'URL publique** du service.

### 6. Amorcer les données

Deux options — choisis-en **une**.

**Option A — repartir de zéro (le plus simple).** Remplace `URL` et `SECRET`,
puis, depuis ton poste :

```bash
URL="https://<ton-service>.northflank.app"
SECRET="<ton CRON_SECRET>"

# a) référence : compétitions, diffuseurs, règles de diffusion
curl -X POST "$URL/api/admin/seed" -H "Authorization: Bearer $SECRET"

# b) tout le calendrier de la saison (fixtures de toutes les compétitions)
curl "$URL/api/cron/resync" -H "Authorization: Bearer $SECRET"

# c) (optionnel) détails historiques : buteurs, compos, stats, notes.
#    À relancer EN BOUCLE tant que la réponse contient "matches" > 0.
curl -X POST "$URL/api/admin/backfill-details" -H "Authorization: Bearer $SECRET"
```

`{"ok":true,...}` = bon ; `401 Unauthorized` = mauvais `SECRET`.

**Option B — transférer ta base locale déjà enrichie.** Si tu veux garder tel
quel ce que tu as en local (16 k+ lignes, historique compris), une fois le
service démarré (schéma créé) :

```bash
# depuis ton poste, PG_LOCAL = ta base locale, PG_PROD = l'URI EXTERNE de l'addon
pg_dump --data-only --no-owner "$PG_LOCAL" | psql "$PG_PROD"
```

(Data-only car le schéma est déjà créé par les migrations au boot. Si des
insertions échouent ensuite sur des ids en doublon, c'est un décalage de
séquences `serial` — le script `apps/api/src/db/migrate-from-sqlite.ts` montre
comment les remettre à niveau avec `setval`.)

### 7. Vérifier

- Ouvre l'`URL` → l'app télétexte s'affiche, le calendrier est rempli.
- `URL/api/logs` → du JSON (historique des crons).
- Dans l'app, tape `800` (**800 LOGS**) → les jobs défilent.
- Ensuite tout est **autonome** : le cron rafraîchit scores, compos, stats et
  notes sans que tu touches à rien.

🎉 C'est en prod.

---

## Au quotidien

- **Redéployer après une modif** : `git push` sur `main` → Northflank rebuild +
  redeploy tout seul (si l'auto-deploy est activé sur le service).
- **Nouvelle migration de base** : rien à faire — elle s'applique au boot
  (`db:migrate`) au prochain déploiement.
- **Voir les logs** : onglet **Logs** du service dans Northflank (format JSON).
  Pour enquêter, ajoute `LOG_LEVEL=debug` en env var, redéploie, puis retire-le.
- **Changement de saison** (reprise des championnats) : passe `CURRENT_SEASON`
  à l'année suivante et redéploie.
- **Sauvegarde de la base** : `scripts/backup.sh` (dump → R2) ; à planifier ou
  lancer avant toute opération risquée.

---

## Si ça coince

| Symptôme | Cause probable | Fix |
|---|---|---|
| Logs : `Missing API_FOOTBALL_KEY` | env var pas (ou mal) posée | recolle `API_FOOTBALL_KEY` dans l'onglet Environment, redéploie |
| Boot échoue sur `db not initialized` / connexion refusée | `DATABASE_URL` faux ou TLS requis | vérifie l'URI interne de l'addon ; ajoute `?sslmode=require` |
| `curl` renvoie `401 Unauthorized` | mauvais `CRON_SECRET` | vérifie que `$SECRET` = le token posé à l'étape 4 |
| Calendrier vide dans l'app | l'amorçage n'a pas tourné | relance l'étape 6 (a puis b) |
| Jobs datés à la mauvaise heure | (ne devrait plus arriver) le cron force `Europe/Paris` | vérifie que le déploiement est à jour |
| Le cron « ne fait rien » | rien de live à cet instant | normal — les ticks sans match sont des no-op ; regarde la P800 pendant un match |

---

## Ce qui reste gratuit

- **Northflank sandbox** : 2 services + 1 base + 2 cron jobs, **always-on**
  (on utilise 1 service + 1 base, et zéro cron-job Northflank car le scheduler
  vit dans le process).
- **Stockage Postgres** : la base fait quelques Mo — négligeable.

Le budget API-Football (7 500 req/jour, plan Pro) est la seule ressource « chère »,
et on plafonne bien en dessous (`DAILY_API_BUDGET = 7000`, un très gros soir ≈ 500).
