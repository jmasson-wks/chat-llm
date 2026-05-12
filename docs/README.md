# Documentation du fork

Ce dossier regroupe la documentation propre à ce fork d'AnythingLLM
(Mintplex Labs). Les sujets liés à des spécificités locales — déploiement
PostgreSQL, IIS, dépendances propriétaires, comparatifs — y sont
maintenus à part de l'upstream.

## Sommaire

- [Workflow de rebase sur l'upstream](#workflow-de-rebase-sur-lupstream)
  - [Contexte](#contexte)
  - [Stratégie retenue](#stratégie-retenue)
  - [Configuration unique à effectuer](#configuration-unique-à-effectuer)
  - [Procédure standard après chaque rebase](#procédure-standard-après-chaque-rebase)
  - [Production](#production)
  - [Pièges à connaître](#pièges-à-connaître)
  - [Règles d'or](#règles-dor)
- Fichiers de référence
  - [`vendor-dependencies.md`](./vendor-dependencies.md)
  - [`vendor-dependencies-fr.md`](./vendor-dependencies-fr.md)
  - [`comparatif-llm-pour-sql-et-analyse-business-2026.md`](./comparatif-llm-pour-sql-et-analyse-business-2026.md)

---

## Workflow de rebase sur l'upstream

### Contexte

L'upstream AnythingLLM utilise **SQLite** comme datasource Prisma. Ce fork
utilise **PostgreSQL** (cf. `server/prisma/schema.prisma` et le service
`postgres` dans `docker/docker-compose.yml`).

Conséquence directe à chaque rebase/merge sur l'upstream :

- `server/prisma/schema.prisma` est mis à jour ⇒ utile, on le garde.
- `server/prisma/migrations/migration_lock.toml` côté upstream contient
  `provider = "sqlite"`, alors que chez nous il vaut `"postgresql"` ⇒
  conflit systématique.
- Les fichiers `server/prisma/migrations/<timestamp>_xxx/migration.sql`
  publiés par l'upstream contiennent du SQL **SQLite-specific**,
  inexploitable sur PostgreSQL.

Sans gestion explicite, le `npx prisma migrate deploy` exécuté au
démarrage du conteneur (`docker/docker-entrypoint.sh`) échouerait.

### Stratégie retenue

Notre dossier `server/prisma/migrations/` est notre **propre lignée de
migrations Postgres**. L'historique upstream nous est inutile en tant que
SQL ; seul le `schema.prisma` upstream sert de source de vérité du modèle
de données.

Deux mécanismes complémentaires :

1. **Auto-résolution des conflits via `.gitattributes`**
   Les fichiers du dossier `server/prisma/migrations/` sont marqués avec
   `merge=ours`. Lors d'un rebase/merge sur upstream, git conserve
   automatiquement notre version sans déclencher de conflit.

2. **Génération d'une migration delta après chaque rebase**
   Une fois le `schema.prisma` mis à jour par le rebase, on régénère
   localement une migration Postgres incrémentale via
   `npx prisma migrate dev`.

### Configuration unique à effectuer

Le `.gitattributes` à la racine du repo contient déjà :

```gitattributes
server/prisma/migrations/**                  merge=ours
server/prisma/migrations/migration_lock.toml merge=ours
```

Mais le merge driver `ours` doit être **activé localement** dans la
configuration git de chaque clone (il n'est pas versionné par git) :

```bash
git config merge.ours.driver true
```

> Note : ne pas confondre `merge=ours` (driver appliqué par fichier via
> `.gitattributes`) avec `git merge -s ours` (stratégie globale).
> Ici on veut bien le **driver par fichier**.

### Procédure standard après chaque rebase

```bash
# 1. Récupérer les changements upstream
git fetch upstream
git rebase upstream/main          # ou: git merge upstream/main

# 2. À ce stade :
#    - schema.prisma a été mis à jour automatiquement
#    - migrations/ est resté sur ta version Postgres (grâce au merge driver)

# 3. Démarrer Postgres (dev) via le compose
docker compose -f docker/docker-compose.yml up -d postgres

# 4. Générer la migration delta pour Postgres
cd server
# PowerShell
$env:DATABASE_CONNECTION_STRING = "postgresql://USER:PASS@127.0.0.1:5432/DB?schema=public"
# ou Bash / WSL
# export DATABASE_CONNECTION_STRING="postgresql://USER:PASS@127.0.0.1:5432/DB?schema=public"

npx prisma migrate dev `
  --name sync_upstream_<YYYYMMDD> `
  --schema=.\prisma\schema.prisma `
  --skip-seed

# 5. Vérifier le SQL généré, puis commit
git add server/prisma/migrations server/prisma/schema.prisma
git commit -m "chore(db): sync postgres migrations with upstream <ref>"
```

`prisma migrate dev` :

- compare le `schema.prisma` à l'état actuel de la DB de dev,
- génère un nouveau dossier `<timestamp>_sync_upstream_xxx/` contenant
  **uniquement le delta** en SQL Postgres valide,
- applique la migration sur la DB de dev.

### Production

Le démarrage du stack reste inchangé :

```bash
docker compose -f docker/docker-compose.yml up -d
```

L'entrypoint exécute toujours :

```sh
npx prisma migrate deploy --schema=./prisma/schema.prisma
```

Seules les **nouvelles migrations** (celles que tu viens de commiter)
sont appliquées sur la DB de production. Les données existantes sont
préservées.

### Pièges à connaître

| Piège | Conséquence | Mitigation |
|---|---|---|
| Upstream renomme une colonne | Prisma génère un `DROP COLUMN` + `ADD COLUMN` ⇒ perte de données | Avant le commit, éditer la migration pour utiliser `ALTER TABLE ... RENAME COLUMN` |
| Upstream change un type de champ incompatible Postgres (ex. `Int` → `BigInt` sur table volumineuse) | Migration lente, locks longs | Tester en staging avec un volume représentatif avant prod |
| Oubli de `git config merge.ours.driver true` | Conflits manuels sur chaque rebase | Le configurer une fois par clone (machine de dev / CI) |
| Lancer `prisma migrate dev` sur la DB de prod | Crée une migration locale et altère la prod sans contrôle | **Toujours** `migrate dev` en dev ; **uniquement** `migrate deploy` en prod |
| `seed.js` upstream cible SQLite | Erreurs au démarrage si le seed tourne | Utiliser `--skip-seed`, ou adapter le seed pour Postgres |
| Modifier une migration déjà déployée | Désync entre `_prisma_migrations` (table de suivi) et fichiers | **Ne jamais** modifier une migration appliquée en prod : créer une nouvelle migration corrective |
| Volume Postgres bind-monté sur `/mnt/...` (NTFS via WSL) | `initdb` échoue (`could not change permissions`) | Utiliser un chemin Linux natif (cf. `POSTGRES_DATA_DIR` dans le compose) |

### Règles d'or

1. **Une seule lignée de migrations Postgres** vit dans ce repo. Celle de
   l'upstream (SQLite) est ignorée mécaniquement par le merge driver.
2. **`schema.prisma` est la source de vérité du modèle.** Les migrations
   ne sont qu'un journal de diffs versionnés pour notre provider.
3. **`migrate dev` en dev, `migrate deploy` en prod.** Jamais l'inverse.
4. **Aucune édition d'une migration déjà déployée.** Tout correctif passe
   par une nouvelle migration.
5. **Tester chaque rebase upstream en staging** avant de déployer en
   production, surtout quand le delta touche à des tables volumineuses ou
   à des renommages.
