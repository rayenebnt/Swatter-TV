# Swatter TV — site web

Site de **Swatter TV & Info**, web TV régionale de la Haute-Savoie et d’Auvergne-Rhône-Alpes (siège à Thyez) :
le direct, les vidéos et le Top 10, le replay, l’info par département, la météo, le programme TV, l’agenda des sorties
et les webcams, le tout administré par l’équipe de la chaîne depuis `/admin`.

Ce document s’adresse aux développeurs. Pour l’équipe éditoriale, voir **[GUIDE_CLIENT.md](GUIDE_CLIENT.md)** (également
affiché dans l’administration, page « Aide ») ;
pour les conventions de code et les contrats entre rubriques, voir **[DEV_NOTES.md](DEV_NOTES.md)**.

## Pile technique

| Brique | Rôle |
|---|---|
| **Next.js 16.3** (App Router, React 19, Turbopack) | site public, rendu serveur et ISR (`revalidate = 60`), sortie `standalone` pour Docker |
| **Payload CMS 3.91** (intégré à Next) | administration sur `/admin`, API REST sur `/api`, API locale côté serveur |
| **PostgreSQL** (`@payloadcms/db-postgres`) | base de données ; schéma poussé automatiquement en développement, migrations en production |
| **sharp** | déclinaisons d’images (WebP) à l’envoi ; `next/image` sert ensuite de l’AVIF/WebP |
| **Plugins Payload** | SEO (bloc « SEO » des contenus), redirections, stockage S3 facultatif (S3, Cloudflare R2, Scaleway…) |
| **hls.js** | lecture des flux HLS (direct, webcams) |
| **Open-Meteo** | prévisions météo (sans clé d’API), importées toutes les heures |
| **Playwright** | tests de bout en bout (bureau 1440 px et mobile 390 px) |

Styles en CSS natif (jetons de la maquette dans `src/styles/globals.css`, un fichier par rubrique), aucune bibliothèque d’interface.

## Prérequis

- **Node.js 22 LTS** (20.18.1 au minimum) et npm ;
- **PostgreSQL 14 ou plus récent** (16 conseillé, c’est la version de `docker-compose.yml`) ;
- pour les tests : le navigateur Chromium de Playwright (`npx playwright install --with-deps chromium`).

## Installation locale

### 1. Base de données

Avec PostgreSQL installé sur la machine :

```bash
sudo -u postgres psql -c "CREATE ROLE swatter WITH LOGIN PASSWORD 'motdepasse';"
sudo -u postgres createdb -O swatter swatter
```

Ou dans un conteneur :

```bash
docker run -d --name swatter-db -p 5432:5432 \
  -e POSTGRES_USER=swatter -e POSTGRES_PASSWORD=motdepasse -e POSTGRES_DB=swatter \
  -v swatter-pgdata:/var/lib/postgresql/data postgres:16
```

### 2. Variables d’environnement

```bash
cp .env.example .env
```

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URI` | oui | connexion PostgreSQL, ex. `postgres://swatter:motdepasse@127.0.0.1:5432/swatter` |
| `PAYLOAD_SECRET` | oui | chaîne aléatoire longue (`openssl rand -hex 32`) : signe les sessions de l’administration |
| `NEXT_PUBLIC_SITE_URL` | oui | adresse publique sans `/` final ; **`http://localhost:3000` en local** (URL canoniques, flux RSS, Open Graph, adresse du serveur Payload) |
| `CRON_SECRET` | oui en production | secret de la tâche planifiée `GET /api/cron/import` (`openssl rand -hex 16`) |
| `NEXT_PUBLIC_BUNNY_LIBRARY_ID` | non | bibliothèque Bunny Stream (vidéos de type « Bunny Stream ») |
| `YOUTUBE_API_KEY` | non | clé de l’API YouTube Data v3 : l’import de la chaîne reprend **toutes** ses vidéos (et leur durée) ; sans clé, il lit le flux RSS public de la chaîne, limité à ses 15 dernières vidéos |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | non | médias sur S3 / R2 / Scaleway au lieu du dossier `media/` (activé dès que `S3_BUCKET` est renseigné) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | oui en production | premier administrateur créé par `src/scripts/init-db.ts` (mot de passe de 12 caractères au moins) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | non (recommandé) | envoi des e-mails de l’administration (« Mot de passe oublié ») ; sans `SMTP_HOST`, ils sont seulement écrits dans le journal du serveur |
| `SEED_FORCE` | non | `1` pour autoriser le jeu de démonstration quand `NODE_ENV=production` |

Les variables `NEXT_PUBLIC_*` sont figées dans le code au moment du build : les changer impose de reconstruire le site.

### 3. Dépendances, premier administrateur et données de démonstration

```bash
npm install
ADMIN_EMAIL=vous@exemple.fr ADMIN_PASSWORD='un-mot-de-passe-solide' npm run payload run src/scripts/init-db.ts
npm run seed
npm run dev
```

- `init-db.ts` crée les tables (schéma « poussé » en développement) puis un administrateur s’il n’en existe aucun.
  Sans `ADMIN_EMAIL` / `ADMIN_PASSWORD`, il utilise `admin@swatter-tv.fr` / `swatter-admin-2026` : **uniquement sur le poste
  de développement** (en production, le script refuse de s'exécuter sans ces deux variables). On peut aussi créer le premier
  compte depuis `http://localhost:3000/admin` : sur une base vide, ce premier compte devient automatiquement administrateur.
- `npm run seed` remplit la base avec le jeu de démonstration : **il efface d’abord tous les contenus** (jamais les
  utilisateurs), puis recrée médias, émissions, une grille de 8 jours à partir d’hier, vidéos, replays, articles, agenda,
  webcams, pages, réglages et prévisions météo. Il est idempotent (relançable à volonté) et refuse de tourner en production
  sans `SEED_FORCE=1`. Les dates sont calculées à partir du jour du lancement : relancez-le pour « rajeunir » la grille,
  l’agenda et la météo.
- Site : <http://localhost:3000> · administration : <http://localhost:3000/admin>.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement (rechargement à chaud) |
| `npm run build` puis `npm run start` | build de production puis serveur de production (environ 4 Go de mémoire pour le build) |
| `npm run typecheck` | vérification TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint sur tout le projet |
| `npm run seed` | jeu de démonstration (voir ci-dessus) |
| `npm run import` | import manuel des flux RSS et de la météo (même traitement que la tâche planifiée) |
| `npm run payload run src/scripts/init-db.ts` | tables + premier administrateur |
| `npm run payload run src/scripts/publish-existing.ts` | une seule fois, sur une base de développement remplie avant l’arrivée des brouillons : publie les contenus existants (sinon invisibles sur le site) |
| `npm run generate:types` | régénère `src/payload-types.ts` après une modification des collections ou des globals |
| `npm run generate:importmap` | régénère `src/app/(payload)/admin/importMap.js` après l’ajout d’un composant d’administration |
| `npm run payload migrate:create <nom>` | crée une migration à partir des changements de schéma |
| `npm run payload migrate` / `migrate:status` | applique les migrations / affiche leur état |
| `npm run test:e2e` | tests de bout en bout (voir plus bas) |

## Structure du projet

```
src/
  app/(frontend)/       pages publiques (accueil, direct, info, météo, agenda, programme TV, replay, vidéos, webcams,
                        recherche, pages éditoriales et redirections dans [...slug], 404, flux info/rss.xml)
  app/(payload)/        administration et API Payload (fichiers générés) + custom.scss (habillage de l’administration)
  app/robots.ts, sitemap.ts
  collections/ globals/ modèle de données (vidéos, replays, articles, agenda, webcams, publicités, pages, émissions,
                        grille, médiathèque, flux RSS, utilisateurs ; réglages du site, météo)
  components/<rubrique>/ composants de chaque rubrique ; components/ui/ primitives partagées ; components/admin/ écrans
                        de l’administration (tableau de bord, aide, outils de la grille, logo)
  lib/                  accès aux données (queries/), dates en heure de Paris (format.ts), liens (urls.ts), imports (import/)
  app/(frontend)/apercu/ mode aperçu (brouillons visibles, réservé aux personnes connectées)
  proxy.ts              grille des programmes de l’administration ouverte sur la semaine en cours
  scripts/              init-db.ts, seed.ts (+ seed/ : données de démonstration), import.ts, publish-existing.ts
  styles/               globals.css (jetons et composants communs) + un fichier par rubrique
seed/assets/            vignettes et clips vidéo du jeu de démonstration
public/visuels/         visuels de repli quand un contenu n’a pas d’image
tests/e2e/              tests Playwright
```

Conventions (données côté serveur via `safe()`, ISR, SEO, images, accessibilité, `prefers-reduced-motion`…) :
voir **[DEV_NOTES.md](DEV_NOTES.md)**.

## Base de données et migrations

- **En développement**, le schéma suit le code (`push`) : modifier une collection suffit, la base s’adapte au
  redémarrage. Pensez à `npm run generate:types`.
- **En production** (`NODE_ENV=production`), le schéma n’est **jamais** poussé : il évolue uniquement par migrations,
  rangées dans `src/migrations/` et versionnées avec le code.

Avant la **première mise en production** (le dossier `src/migrations/` n’existe pas encore), créez la migration initiale
depuis un poste de développement relié à une base, puis versionnez-la :

```bash
npm run payload migrate:create initiale
git add src/migrations && git commit -m "Migration initiale"
```

Ensuite, à chaque modification du modèle de données : `npm run payload migrate:create <nom-explicite>`, relisez le fichier
généré, versionnez-le ; au déploiement, `npm run payload migrate` l’applique (automatique avec Docker Compose : service
`migrate`). Sans migration, `payload migrate` se contente d’afficher « No migrations to run » et la base de production reste
vide. Gardez des bases distinctes pour le développement (schéma poussé) et la production (migrations) : sur une base déjà
poussée, `payload migrate` demande une confirmation interactive avant d’effacer des données.

## Déploiement recommandé : VPS avec Docker Compose (ou Coolify)

L’image (`Dockerfile`, base `node:22-bookworm-slim`, utilisateur non root, sortie `standalone`, `HEALTHCHECK`) a quatre
étapes : `deps`, `builder`, `tools` (sources complètes et CLI Payload) et `runner` (le site seul). `docker-compose.yml`
assemble :

| Service | Rôle |
|---|---|
| `db` | PostgreSQL 16, volume `pgdata` |
| `migrate` | applique les migrations puis s’arrête ; le site attend qu’il ait réussi |
| `app` | le site (port 3000, publié sur `127.0.0.1` uniquement), volume `media` pour les fichiers envoyés |
| `cron` | appelle `GET /api/cron/import` dès que le site est prêt, puis toutes les heures |
| `tools` | commandes ponctuelles (profil `tools`, jamais démarré par `up`) |

Sur un serveur avec Docker Engine et le plugin Compose (2 vCPU et 4 Go de mémoire conseillés pour construire l’image) :

```bash
git clone <dépôt> && cd Swatter-TV/site
cp .env.example .env
# Renseigner : POSTGRES_PASSWORD, PAYLOAD_SECRET, CRON_SECRET, NEXT_PUBLIC_SITE_URL=https://www.swatter-tv.fr
# (facultatif : POSTGRES_USER, POSTGRES_DB, APP_PORT, NEXT_PUBLIC_BUNNY_LIBRARY_ID, S3_*). DATABASE_URI est construit par Compose.
docker compose up -d --build
docker compose ps              # « app » doit passer à « healthy »
docker compose logs -f app cron
```

Placez ensuite un reverse proxy HTTPS devant `127.0.0.1:3000`. Exemple avec Caddy (certificats automatiques) :

```
www.swatter-tv.fr {
	reverse_proxy 127.0.0.1:3000
}
swatter-tv.fr {
	redir https://www.swatter-tv.fr{uri} permanent
}
```

Avec Nginx, augmentez `client_max_body_size` (par exemple `500m`) pour l’envoi de vidéos dans la médiathèque.

Premier administrateur : ouvrir `https://www.swatter-tv.fr/admin` et créer le compte avec le rôle « Administrateur », ou :

```bash
docker compose run --rm -e ADMIN_EMAIL=… -e ADMIN_PASSWORD=… tools npm run payload run src/scripts/init-db.ts
```

Autres commandes ponctuelles : `docker compose run --rm tools npm run payload migrate:status`,
`docker compose run --rm tools npm run import`, et pour une démonstration seulement
`docker compose run --rm -e SEED_FORCE=1 tools npm run seed` (efface les contenus).

**Coolify** : créer une ressource « Docker Compose » depuis le dépôt Git, répertoire de base `/site`, fichier
`docker-compose.yml` ; saisir les variables d’environnement dans Coolify et attribuer le domaine au service `app`
(port 3000) : le proxy de Coolify gère le HTTPS.

## Alternative : Vercel + Neon + stockage S3 / R2

- Projet Vercel avec `site` comme répertoire racine ; base **Neon** (chaîne de connexion avec `?sslmode=require`) dans
  `DATABASE_URI` ; `PAYLOAD_SECRET`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.
- Le disque de Vercel est éphémère : le stockage des médias sur **S3 / Cloudflare R2** est obligatoire. Pour R2 :
  `S3_BUCKET`, `S3_REGION=auto`, `S3_ENDPOINT=https://<identifiant-de-compte>.r2.cloudflarestorage.com`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Les fichiers restent servis par `/api/media/file/…`.
- Commande de build : `npm run payload migrate && npm run build` (les migrations s’appliquent avant chaque déploiement).
- Tâche planifiée : fichier `vercel.json` à la racine du projet :
  `{ "crons": [{ "path": "/api/cron/import", "schedule": "0 * * * *" }] }`. Vercel ajoute lui-même l’en-tête
  `Authorization: Bearer <CRON_SECRET>` quand la variable existe. Une fréquence horaire demande l’offre Pro (une fois par
  jour en Hobby) ; sinon, utiliser un service externe (cron-job.org…) avec le même en-tête.

## Tâche planifiée horaire

`GET /api/cron/import`, protégée par `CRON_SECRET` (de préférence dans l’en-tête `Authorization: Bearer <secret>`, à défaut
`?secret=<secret>`, qui risque de finir dans les journaux d’accès) :

1. importe dans « L’Info » les articles des flux RSS actifs (collection « Flux RSS », sans doublon) ;
2. met à jour les prévisions météo depuis Open-Meteo, si « Mise à jour automatique » est cochée dans le global « Météo »
   (sinon l’étape est simplement ignorée) ;
3. importe dans « Vidéos » les nouvelles vidéos de la chaîne YouTube renseignée dans l’administration (global
   « Chaîne YouTube », voir `src/lib/import/youtube.ts`) ;
4. supprime les fiches ouvertes avec « Ajouter » puis abandonnées sans titre depuis plus de 24 h (brouillons jamais
   publiés) ;
5. régénère les pages du site si quelque chose a changé.

La réponse JSON détaille le résultat (`rss.created`, `rss.errors`, `meteo.ok`, `drafts.deleted`…). Avec Docker Compose, le service `cron`
s’en charge. Sur un serveur sans Docker, une ligne de crontab suffit :

```
7 * * * * curl -fsS -m 300 -H "Authorization: Bearer <CRON_SECRET>" https://www.swatter-tv.fr/api/cron/import > /dev/null
```

Après la première mise en ligne, lancez un import immédiat (`npm run import`, ou `docker compose run --rm tools npm run import`)
pour remplacer sans attendre les prévisions de démonstration.

## Sauvegardes

À automatiser chaque nuit, avec une copie hors du serveur, et à tester en restauration de temps en temps.

```bash
# Base (format compressé de pg_dump)
docker compose exec -T db pg_dump -U swatter -Fc swatter > swatter-$(date +%F).dump
# Médias (volume « media », si les fichiers ne sont pas sur S3 / R2)
docker run --rm -v swatter-tv_media:/media:ro -v "$PWD":/sauvegarde alpine \
  tar czf /sauvegarde/media-$(date +%F).tar.gz -C /media .
```

Restauration (site arrêté : `docker compose stop app cron`, puis `docker compose start app cron`) :
`docker compose exec -T db pg_restore -U swatter -d swatter --clean --if-exists < swatter-AAAA-MM-JJ.dump`, puis extraction
de l’archive dans le volume `media`. Adaptez `swatter` si `POSTGRES_USER` ou `POSTGRES_DB` ont été changés. Sans Docker : `pg_dump "$DATABASE_URI" -Fc -f swatter.dump` et une
archive du dossier `media/`. Avec S3 / R2, activez le versionnage du bucket ou synchronisez-le ailleurs (`rclone sync`).

## Mises à jour

- **Code du site** : `git pull` puis `docker compose up -d --build` ; les nouvelles migrations s’appliquent avant le
  redémarrage du site (`docker compose logs migrate` en cas de doute).
- **Dépendances** : tous les paquets `payload` et `@payloadcms/*` (dont `@payloadcms/live-preview-react`) doivent garder **exactement la même version** ; mettez-les
  à jour ensemble, avec Next.js et React, après lecture des notes de version. Puis `npm run generate:importmap`,
  `npm run generate:types`, `npm run typecheck`, `npm run lint`, `npm run build` et les tests de bout en bout ; une
  migration est nécessaire si la mise à jour change le schéma (`migrate:create` ne trouve rien sinon).
- **Système** : reconstruisez régulièrement l’image pour les correctifs de sécurité (`docker compose build --pull`,
  `docker compose pull db`). Un changement de version majeure de PostgreSQL (16 → 17) passe par une sauvegarde puis une
  restauration.

## Tests de bout en bout

```bash
npx playwright install --with-deps chromium        # une seule fois
# Contre un serveur déjà démarré (développement ou production), base remplie par npm run seed :
E2E_BASE_URL=http://localhost:3000 npx playwright test
# Ou build de production puis tests (« npm run start » est lancé automatiquement) :
npm run build && npm run test:e2e
# Import de la chaîne YouTube, avec un faux YouTube local (tests/e2e/youtube-mock.ts) : serveur lancé avec
# YOUTUBE_BASE=http://127.0.0.1:8765 YOUTUBE_THUMB_BASE=http://127.0.0.1:8765/vi, puis
E2E_YOUTUBE_MOCK_PORT=8765 E2E_BASE_URL=http://localhost:3000 npx playwright test
```

Deux projets : `bureau` (1440 × 900) et `mobile` (390 × 844, tactile). Les fichiers de `tests/e2e/` :

- `pages.spec.ts` : chaque adresse répond 200 (404 pour une adresse inconnue), un seul `h1`, aucun débordement horizontal,
  aucune erreur JavaScript, de console (hydratation comprise) ni réponse HTTP en erreur, langue, URL canonique et JSON-LD
  valides ; administration et API joignables ; tâche planifiée refusée sans secret ;
- `rubriques.spec.ts` : contenu de chaque rubrique (accueil complet, info et flux RSS, météo, programme TV, agenda,
  webcams, vidéos, replay, direct, recherche, page éditoriale et redirections) ;
- `interactions.spec.ts` : recherche au clavier, bandeau cookies, menu mobile, lien d’évitement ;
- `admin.spec.ts` (bureau) : tableau de bord, page d’aide, outil de la grille des programmes, recopie de semaine refusée
  proprement, rubriques techniques masquées aux éditeurs. Identifiants : `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (par défaut
  ceux du poste de développement) ; sans compte valide, ces tests sont ignorés.

Les adresses de détail sont lues dans l’API REST : sans données, les tests concernés sont ignorés. Le Chromium de Playwright
ne décode pas le H.264 : les MP4 de démonstration y apparaissent en « Vidéo indisponible ». Les tests vérifient donc la
présence du lecteur, pas la lecture. Options utiles : `--project=mobile`, `-g agenda`, `--ui`.
