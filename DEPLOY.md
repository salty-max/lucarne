# Mise en prod — Lucarne

Guide pas-à-pas, sans prérequis dev-ops. Tout tourne sur **Cloudflare** (un seul
compte, un seul outil) et **rentre dans le free-tier** — coût : **0 €** (le seul
abonnement payant, c'est API-Football Pro, que tu as déjà).

- **Temps** : ~20 min la première fois, ~30 s les fois suivantes (`bun run deploy`).
- **Ce qu'on déploie** : le Worker (API + crons) + la base D1 + le SPA React, servis
  depuis le edge Cloudflare.
- Toutes les commandes `wrangler` se lancent **depuis `apps/api/`** (là où vit
  `wrangler.jsonc`). Le `bun run deploy` final se lance **depuis la racine**.

> 🔑 **Sécurité** : les deux secrets (clé API-Football, token admin) se posent avec
> `wrangler secret` et ne finissent **jamais** dans un fichier. En revanche les
> `database_id`/`kv id` qu'on colle dans `wrangler.jsonc` ne sont **pas** des
> secrets (juste des identifiants de ressources) — tu peux committer le fichier.

---

## Une seule fois : le setup

### 0. Compte + connexion

1. Crée un compte Cloudflare (gratuit) : https://dash.cloudflare.com/sign-up
2. Connecte le CLI (ouvre le navigateur, tu cliques « Allow ») :

```bash
cd apps/api
bunx wrangler login
```

### 1. Créer la base de données (D1)

```bash
bunx wrangler d1 create lucarne
```

Ça imprime un bloc avec une ligne `database_id = "xxxxxxxx-...."`.
**Copie ce `database_id`** et colle-le dans `apps/api/wrangler.jsonc` à la place de
`REPLACE_WITH_D1_DATABASE_ID`.

### 2. Créer le cache live (KV)

```bash
bunx wrangler kv namespace create SCHEDULE_KV
```

Ça imprime un `id = "yyyyyyyy"`. Colle-le dans `wrangler.jsonc` à la place de
`REPLACE_WITH_KV_NAMESPACE_ID`.

### 3. Créer les tables sur la base (migrations)

```bash
bunx wrangler d1 migrations apply lucarne --remote
```

Ça liste les 7 migrations, tu confirmes avec `y`, et ça crée toutes les tables.
(`--remote` = sur la vraie base Cloudflare ; sans, ça toucherait une base locale.)

### 4. Premier déploiement

Depuis la **racine** du repo :

```bash
cd ..              # (retour à lucarne/ depuis apps/api)
bun run deploy
```

`turbo` build le front **puis** déploie le Worker. À la fin, wrangler affiche
l'URL de ton app :

```
https://lucarne.<ton-sous-domaine>.workers.dev
```

👉 **Note cette URL.** (Les crons commencent à tourner tout de suite — ils vont
« échouer » quelques minutes avec `Missing API_FOOTBALL_KEY`, c'est **normal** :
on pose les secrets juste après.)

### 5. Poser les deux secrets

Génère d'abord un token admin (garde-le, il sert à l'amorçage juste après) :

```bash
openssl rand -hex 32
```

Puis, depuis `apps/api/` :

```bash
cd apps/api

bunx wrangler secret put API_FOOTBALL_KEY
# → colle ta clé API-Football (la même que dans apps/api/.env.local)

bunx wrangler secret put CRON_SECRET
# → colle le token généré au-dessus
```

Dès que les secrets sont posés, les crons se mettent à marcher tout seuls. Plus
besoin de redéployer.

### 6. Amorcer les données

Remplace `URL` et `SECRET` par ton URL (étape 4) et ton token (étape 5) :

```bash
URL="https://lucarne.<ton-sous-domaine>.workers.dev"
SECRET="<ton CRON_SECRET>"

# a) données de référence : compétitions, diffuseurs, règles de diffusion
curl -X POST "$URL/api/admin/seed" -H "Authorization: Bearer $SECRET"

# b) tout le calendrier de la saison (fixtures des 10 compétitions)
curl "$URL/api/cron/resync" -H "Authorization: Bearer $SECRET"

# c) (optionnel) détails historiques : buteurs, compos, stats, notes.
#    À relancer EN BOUCLE tant que la réponse contient "matches" > 0.
curl -X POST "$URL/api/admin/backfill-details" -H "Authorization: Bearer $SECRET"
```

Une réponse `{"ok":true,...}` = c'est bon. Un `401 Unauthorized` = le `SECRET`
ne correspond pas.

### 7. Vérifier

- Ouvre ton `URL` dans le navigateur → l'app télétexte s'affiche, le calendrier
  est rempli.
- `URL/api/logs` → du JSON (l'historique des crons).
- Dans l'app, tape `800` (ou clique **800 LOGS**) → tu vois les jobs défiler.
- À partir de là, tout est **autonome** : les crons rafraîchissent scores, compos,
  stats et notes sans que tu touches à rien.

🎉 C'est en prod.

---

## Au quotidien

- **Redéployer après une modif de code** (depuis la racine) :
  ```bash
  bun run deploy
  ```
  (rebuild le front + redéploie le Worker en une commande.)

- **Nouvelle migration de base** (si tu as changé le schéma) : lance-la **avant**
  le deploy, depuis `apps/api/` :
  ```bash
  bunx wrangler d1 migrations apply lucarne --remote
  ```

- **Voir les logs en direct** (les crons en JSON, depuis `apps/api/`) :
  ```bash
  bunx wrangler tail
  ```

- **Changement de saison** (ex. reprise des championnats en août) : passe
  `CURRENT_SEASON` de `"2025"` à `"2026"` dans `wrangler.jsonc`, puis
  `bun run deploy`.

- **Passer les logs en debug le temps d'une enquête** : ajoute
  `"LOG_LEVEL": "debug"` dans le bloc `vars` de `wrangler.jsonc`, redéploie,
  puis remets-le à `"info"` (ou enlève-le) ensuite.

---

## Si ça coince

| Symptôme | Cause probable | Fix |
|---|---|---|
| Logs : `Missing API_FOOTBALL_KEY` | secret pas (ou mal) posé | re-lance `bunx wrangler secret put API_FOOTBALL_KEY` depuis `apps/api/` |
| `curl` renvoie `401 Unauthorized` | mauvais `CRON_SECRET` dans la commande | vérifie que `$SECRET` = le token posé à l'étape 5 |
| Calendrier vide dans l'app | l'amorçage n'a pas tourné | relance l'étape 6 (a puis b) |
| `deploy` échoue sur les bindings D1/KV | `database_id`/`kv id` encore en `REPLACE_...` | recopie les vrais ids dans `wrangler.jsonc` (étapes 1–2) |
| Les crons ne semblent rien faire | rien n'est « live » à cet instant | normal — les ticks sans match sont des no-op ; regarde la P800 pendant un match |

---

## Ce qui reste gratuit

- **Workers** : 100 000 requêtes/jour (nos crons = ~1 440/jour + ton trafic).
- **D1** : 5 Go, 5 M lignes lues/jour, 100 k écrites/jour.
- **KV** : 100 k lectures/jour (le gate live en lit ~1 440).
- **Cron Triggers + Static Assets** : gratuits.

Le budget API-Football (7 500 req/jour, plan Pro) est la seule ressource « chère »,
et on plafonne bien en dessous (`DAILY_API_BUDGET = 7000`, un très gros soir ≈ 500).
