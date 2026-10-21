# Swatter TV — site web

Site de **Swatter TV & Info**, web TV régionale d’Auvergne-Rhône-Alpes (siège à Thyez, Haute-Savoie) :
le direct, les vidéos et le Top 10, le replay, l’info par département, la météo, le programme TV, l’agenda des sorties
et les webcams, plus un espace membres pour les visiteurs (« Mon espace » : historique, « Ma liste », département), le
tout administré par l’équipe de la chaîne depuis `/admin`.

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
| **Vitest** et **Playwright** | tests unitaires, d’intégration (Payload sur une base de test) et de bout en bout (bureau 1440 px et mobile 390 px) |

Styles en CSS natif (jetons de la maquette dans `src/styles/globals.css`, un fichier par rubrique), aucune bibliothèque d’interface.

## Prérequis

- **Node.js 22 LTS** (20.18.1 au minimum) et npm ;
- **PostgreSQL 14 ou plus récent** (16 conseillé, c’est la version de `docker-compose.yml`) ;
- pour les tests : le navigateur Chromium de Playwright (`npx playwright install --with-deps chromium`) et un compte
  PostgreSQL autorisé à créer des bases (voir « Tests »).

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
| `PAYLOAD_SECRET` | oui | chaîne aléatoire longue (`openssl rand -hex 32`) : signe les sessions de l’administration et, par une clé qui en est dérivée, celles des membres (le changer déconnecte tout le monde) |
| `NEXT_PUBLIC_SITE_URL` | oui | adresse publique sans `/` final ; **`http://localhost:3000` en local** (URL canoniques, Open Graph, adresse du serveur Payload) |
| `CRON_SECRET` | oui en production | secret de la tâche planifiée `GET /api/cron/import` (`openssl rand -hex 16`) |
| `NEXT_PUBLIC_BUNNY_LIBRARY_ID` | non | bibliothèque Bunny Stream (vidéos de type « Bunny Stream ») |
| `YOUTUBE_API_KEY` | non | clé de l’API YouTube Data v3 : l’import de la chaîne reprend **toutes** ses vidéos (et leur durée) ; sans clé, il lit le flux RSS public de la chaîne, limité à ses 15 dernières vidéos |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | non | médias sur S3 / R2 / Scaleway au lieu du dossier `media/` (activé dès que `S3_BUCKET` est renseigné) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | oui en production | premier administrateur créé par `src/scripts/init-db.ts` (mot de passe de 12 caractères au moins) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | **oui en production** | envoi des e-mails : « Mot de passe oublié » de l’administration, messages du formulaire « Proposer une info » (vers l’e-mail de contact des réglages, à défaut contact@swatter-tv.fr) et e-mail « mot de passe oublié » des membres. Sans `SMTP_HOST`, ils sont seulement écrits dans le journal du serveur (les messages restent lisibles dans « Messages reçus » ; hors production, le lien des e-mails des membres y est rappelé en clair pour tester). `SMTP_FROM` : adresse d’expédition autorisée par le serveur SMTP (par défaut contact@swatter-tv.fr) ; port 465 = SSL, sinon STARTTLS |
| `SEED_FORCE` | non | `1` pour autoriser les contenus de départ (`npm run seed`) quand `NODE_ENV=production` |
| `TRUSTED_PROXY_HOPS` | non | nombre de reverse proxys en chaîne devant le site (1 par défaut ; 2 derrière un CDN puis Caddy) : sert à lire l’adresse IP du visiteur pour les limites anti-abus |
| `MEMBER_RATE_FACTOR` | non (tests seulement) | multiplie les limites par adresse IP de l’espace membres (inscriptions, connexions, e-mails…) : `10` pour les tests de bout en bout, qui partent tous de la même adresse. Jamais en production |

Les variables `NEXT_PUBLIC_*` sont figées dans le code au moment du build : les changer impose de reconstruire le site.

### 3. Dépendances, premier administrateur et contenus de départ

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
- `npm run seed` remplit la base avec les contenus de départ, des modèles marqués « Exemple » que le client remplace
  (liste dans GUIDE_CLIENT.md, partie 1) : **il efface d’abord tous les contenus** (jamais les
  utilisateurs ni les comptes des membres ; leur historique et « Ma liste », qui désignent des contenus, sont vidés), puis recrée médias, 4 émissions d’exemple et une grille type sur 8 jours à partir d’hier, 3 articles,
  3 événements, 1 replay, 2 webcams, les pages (« [à compléter] »), les réglages et la météo : les prévisions actuelles
  d’Open-Meteo, ou à défaut (pas d’accès à internet) des prévisions de démonstration remplacées dès que le site joint
  Open-Meteo (aucune vidéo : « Vidéos » et « Replays » se remplissent avec la chaîne YouTube du client, fiche « Chaîne
  YouTube » de l’administration). Il est idempotent (relançable à volonté) et refuse de tourner en production
  sans `SEED_FORCE=1`. Les dates sont calculées à partir du jour du lancement : relancez-le pour « rajeunir » la grille,
  l’agenda et la météo.
- Après un `git pull`, si le serveur ou `npm run seed` restent bloqués sur une question en anglais (« Is … column
  created or renamed from another column? », « Accept warnings? »), ou si l’administration ne montre pas les nouveaux
  contenus : arrêtez le serveur (Ctrl+C), lancez **`npm run maj-base`** (garde tous vos contenus), puis `npm run dev`.
  `npm run reinit` repart de zéro (contenus « Exemple », comptes de l’équipe conservés, membres effacés) : seulement si
  vous voulez tout effacer.
  Quand un champ disparaît du code, ajoutez sa colonne à la liste `OBSOLETE` de `src/scripts/maj-base.ts`.
- Site : <http://localhost:3000> · administration : <http://localhost:3000/admin>.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement (rechargement à chaud) ; précharge ensuite chaque rubrique et l’administration (`scripts/dev.mjs`) pour que les premiers clics ne paient pas la compilation (`npm run dev:brut` : sans préchargement) |
| `npm run rapide` | build de production puis serveur de production en local : la vraie vitesse du site (0,1 à 0,4 s par clic), à utiliser pour juger des temps de réponse |
| `npm run build` puis `npm run start` | build de production puis serveur de production (environ 4 Go de mémoire pour le build) |
| `npm run typecheck` | vérification TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint sur tout le projet |
| `npm run seed` | contenus de départ « Exemple » (voir ci-dessus) |
| `npm run maj-base` | **après un `git pull` qui change la structure des données** : met la base locale à jour **sans rien effacer** (retire les colonnes supprimées du code, qui feraient poser une question à drizzle, puis ajoute les nouvelles). Arrêtez `npm run dev` avant. Refusé en production (migrations) |
| `npm run exemples` | ajoute les contenus d’exemple qui manquent **sans rien supprimer** (pour l’instant : le replay d’exemple, si « Replays » est vide) |
| `npm run test-email -- adresse@exemple.fr` | vérifie l’envoi des e-mails : connexion au serveur SMTP, identifiants, puis envoi d’un e-mail d’essai (messages clairs en cas d’erreur) |
| `npm run webcams` | ajoute les 14 webcams de la chaîne qui manquent (une par département, Suisse et Aoste dans « Web Cams + »), sans lien de flux (« Bientôt en direct »), **sans rien modifier ni supprimer** d’autre ; retire seulement les 2 webcams « (exemple) » d’origine si elles n’ont pas été modifiées |
| `npm run maj-pages` | remplace le texte des pages mentions légales, crédits, vie privée et le groupe par celui de `src/scripts/seed/pages.ts`, sans toucher au reste ; l’ancien texte reste dans l’historique de la page. `npm run maj-pages -- mentions-legales` pour une seule page ; **`npm run maj-pages -- vie-privee`** applique le texte de la page Vie privée qui décrit l’espace membres sur une base existante (sans écraser les autres pages, peut-être déjà complétées par le client) |
| `npm run reinit` | **après un `git pull` qui change la structure des données** : remet la base locale à neuf sans aucune question (garde les comptes de l’équipe et leurs mots de passe, efface les membres, vide la médiathèque, recharge les contenus « Exemple »). Arrêtez `npm run dev` avant. Refusé en production |
| `npm run import` | import manuel de la météo et des vidéos de la chaîne YouTube (même traitement que la tâche planifiée) |
| `npm run payload run src/scripts/init-db.ts` | tables + premier administrateur |
| `npm run payload run src/scripts/publish-existing.ts` | une seule fois, sur une base de développement remplie avant l’arrivée des brouillons : publie les contenus existants (sinon invisibles sur le site) |
| `npm run generate:types` | régénère `src/payload-types.ts` après une modification des collections ou des globals |
| `npm run generate:importmap` | régénère `src/app/(payload)/admin/importMap.js` après l’ajout d’un composant d’administration |
| `npm run payload migrate:create <nom>` | crée une migration à partir des changements de schéma |
| `npm run payload migrate` / `migrate:status` | applique les migrations / affiche leur état |
| `npm run test:complet` | **avant une livraison** : TypeScript, ESLint, tests unitaires, d’intégration et de bout en bout, sans toucher à la base de travail (voir « Tests ») |
| `npm test` | tests unitaires et d’intégration |
| `npm run test:unit` / `test:integration` / `test:e2e` | un seul niveau de tests (voir « Tests ») |

## Structure du projet

```
src/
  app/(frontend)/       pages publiques (accueil, direct, info, météo, agenda, programme TV, replay, vidéos, webcams,
                        recherche, pages éditoriales et redirections dans [...slug], 404) ; espace membres : inscription,
                        connexion, mot-de-passe-oublie, compte/ (Mon espace, nouveau mot de passe)
  app/(payload)/        administration et API Payload (fichiers générés) + custom.scss (habillage de l’administration)
  app/robots.ts, sitemap.ts
  collections/ globals/ modèle de données (vidéos, replays, articles, agenda, webcams, publicités, pages, émissions,
                        grille, médiathèque, utilisateurs, membres et leur activité ; réglages du site, météo, chaîne YouTube)
  components/<rubrique>/ composants de chaque rubrique ; components/ui/ primitives partagées ; components/admin/ écrans
                        de l’administration (tableau de bord, aide, outils de la grille, export des membres, logo) ;
                        components/members/ espace membres (formulaires, Mon espace, bouton « Ajouter à ma liste »)
  lib/                  accès aux données (queries/), dates en heure de Paris (format.ts), liens (urls.ts), imports (import/),
                        espace membres (members/ : API, sessions, mots de passe, e-mails)
  app/(frontend)/apercu/ mode aperçu (brouillons visibles, réservé aux personnes connectées)
  proxy.ts              grille des programmes de l’administration ouverte sur la semaine en cours
  scripts/              init-db.ts, seed.ts (+ seed/ : contenus de départ), import.ts, publish-existing.ts
  styles/               globals.css (jetons et composants communs) + un fichier par rubrique
seed/assets/            clip vidéo d’exemple du direct (contenus de départ)
public/visuels/         visuels de repli quand un contenu n’a pas d’image
tests/unit/             tests unitaires (Vitest)
tests/integration/      tests d’intégration : Payload sur une base de test (Vitest)
tests/e2e/              tests de bout en bout (Playwright) ; tests/mocks/ : faux Open-Meteo
scripts/test-complet.mjs  npm run test:complet
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

## Espace membres (comptes des visiteurs)

Les visiteurs créent un compte sur `/inscription`, se connectent sur `/connexion` et retrouvent sur `/compte` leur
historique, « Ma liste », leur département et leur profil. Détails et contrat de l’API : **[DEV_NOTES.md](DEV_NOTES.md)**,
partie « Espace membres » ; côté équipe : GUIDE_CLIENT.md, partie 21.

- **Sessions séparées de l’administration** : les membres ne passent jamais par l’authentification de Payload. Leur
  session est un cookie signé `sw_membre` (HMAC-SHA-256 avec une clé dérivée de `PAYLOAD_SECRET`, 30 jours, `HttpOnly`,
  `SameSite=Lax`, `Secure` en HTTPS) accompagné d’un cookie témoin `sw_connecte` lisible par le navigateur (affichage de
  « Mon espace » sur les pages en cache, aucune valeur sensible). Un membre n’est donc jamais `req.user` et n’a aucun
  droit dans l’administration ni dans l’API REST de Payload.
- **Collections** : `members` (profil, réglages, empreintes ; lecture et modification réservées aux administrateurs,
  aucune création par l’API), `member-history` et `member-favorites` (une ligne par membre et par contenu, écrites
  uniquement par l’API des membres). Réglage : `settings.members.signupOpen` (« Inscriptions ouvertes »).
- **API** : `/api/compte/…` (inscription, connexion, déconnexion, mot de passe, profil, historique,
  « Ma liste », export et suppression des données), déclarée dans `src/lib/members/endpoints.ts` ; les requêtes qui
  modifient quelque chose doivent venir du site (en-tête `Origin`, à défaut `Sec-Fetch-Site`). `GET /api/membres/lettre-info.csv` : export des
  membres qui acceptent les e-mails, réservé aux administrateurs connectés à `/admin`.
- **Inscription** : prénom, e-mail et mot de passe ; le compte est actif aussitôt et le membre connecté (pas d’e-mail de
  confirmation, choix du client). Conséquence : l’adresse n’est pas vérifiée, et l’inscription signale une adresse déjà
  inscrite (limitée à 10 essais par heure et par adresse IP).
- **Mots de passe** : scrypt (N = 16384, r = 8, p = 1, sel aléatoire), comparaison en temps constant ; lien de nouveau
  mot de passe (1 h) : seule l’empreinte SHA-256 du jeton est enregistrée, et il ne sert qu’une fois (consommé en une
  seule requête). Compte bloqué 15 minutes après 5 mots de passe erronés, essais comptés en base avant la vérification
  (une rafale d’essais simultanés ne contourne pas le blocage) ; une adresse sans compte répond de la même façon à la
  connexion. « Mot de passe oublié » répond tout de suite (`{ ok: true }`) et fait son travail après la réponse
  (`after()` de Next.js).
- **Limites par adresse IP** (mémoire du processus : suffisant pour un serveur unique, approximatif sur Vercel où
  plusieurs instances coexistent) : inscriptions, connexions, demandes de nouveau mot de passe,
  changements de mot de passe et suppressions de compte. `MEMBER_RATE_FACTOR=10` les
  relâche pour les tests de bout en bout. L’adresse lue est le **dernier** maillon de `X-Forwarded-For`, celui qu’écrit
  le reverse proxy (Caddy, Traefik/Coolify et Nginx avec `$proxy_add_x_forwarded_for` le font) : le visiteur ne peut
  pas l’inventer. Derrière deux proxys en chaîne (CDN puis Caddy, par exemple), mettre `TRUSTED_PROXY_HOPS=2`. Le
  serveur Node ne doit pas être joignable directement depuis Internet (port 3000 réservé au proxy).
- **E-mails** : par le SMTP du site (voir les variables). Sans `SMTP_HOST` hors production, le lien de nouveau mot de
  passe est écrit dans le journal du serveur (`[swatter] (développement, pas de SMTP) …`) pour tester.
- **Production** : les trois collections et le champ `settings.members` demandent une migration
  (`npm run payload migrate:create espace-membres` si elle n’existe pas encore dans `src/migrations/`). Sur un site déjà
  en ligne, `npm run maj-pages -- vie-privee` publie le texte de la page Vie privée qui décrit l’espace membres (avec
  Docker Compose : `docker compose run --rm tools npm run maj-pages -- vie-privee`).

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
`docker compose run --rm tools npm run import`, et **au premier déploiement seulement**, pour livrer le site avec
les contenus de départ à modifier : `docker compose run --rm -e SEED_FORCE=1 tools npm run seed` (efface tous les
contenus : jamais une fois le site rempli).

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

1. met à jour les prévisions météo depuis Open-Meteo, si « Mise à jour automatique » est cochée dans le global « Météo »
   (sinon l’étape est simplement ignorée) ;
2. met dans « Vidéos » et « Replays » les dernières vidéos de la chaîne YouTube renseignée dans l’administration
   (global « Chaîne YouTube », voir `src/lib/import/youtube.ts`) : celles qui manquent sont ajoutées ;
3. supprime les fiches ouvertes avec « Ajouter » puis abandonnées sans titre depuis plus de 24 h (brouillons jamais
   publiés) ;
4. régénère les pages du site si quelque chose a changé.

Filet de sécurité pour la météo (poste de développement, hébergement sans tâche planifiée) : quand une page affiche des
prévisions de plus d’une heure, ou celles de démonstration, le site interroge lui-même Open-Meteo en arrière-plan, au plus
une fois toutes les 10 minutes (`src/lib/meteo-refresh.ts`) ; les pages montrent les nouvelles prévisions à leur
régénération suivante (moins d’une minute). `OPEN_METEO_URL` remplace l’adresse d’Open-Meteo (tests hors ligne).

La réponse JSON détaille le résultat (`meteo.ok`, `youtube.videos`, `drafts.deleted`…). Avec Docker Compose, le service `cron`
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
  `npm run generate:types` puis `npm run test:complet` (TypeScript, ESLint, construction et tous les tests) ; une
  migration est nécessaire si la mise à jour change le schéma (`migrate:create` ne trouve rien sinon).
- **Système** : reconstruisez régulièrement l’image pour les correctifs de sécurité (`docker compose build --pull`,
  `docker compose pull db`). Un changement de version majeure de PostgreSQL (16 → 17) passe par une sauvegarde puis une
  restauration.

## Tests

```bash
npm run test:complet                 # tout, avant une livraison (environ 10 minutes)
npm run test:complet -- --rapide     # TypeScript, ESLint, tests unitaires et d’intégration (environ 3 minutes)
npm run test:complet -- --e2e        # seulement les tests de bout en bout
npm run test:complet -- --garder     # laisse le site de test ouvert à la fin (http://localhost:3100), Ctrl+C pour l’arrêter
```

**Prérequis** : PostgreSQL démarré (`docker start swatter-db`), `npm install`, et une seule fois le navigateur des tests
(`npx playwright install --with-deps chromium`). Le compte PostgreSQL de `.env` doit pouvoir créer des bases : c’est le
cas du conteneur Docker ; avec un PostgreSQL installé sur la machine :
`sudo -u postgres psql -c "ALTER ROLE swatter CREATEDB;"`. Aucun accès à Internet n’est nécessaire.

`test:complet` ne touche ni à la base de travail, ni au dossier `media/`, ni à la construction `.next` : `npm run dev`
peut rester ouvert. Il travaille sur ses propres bases, recréées à chaque lancement et nommées d’après la base de
travail (`swatter_tests` pour les tests d’intégration ; `swatter_e2e` pour ceux de bout en bout, remplie par les
migrations, le premier administrateur et les contenus de départ), ses
propres médias (`.tests/`), sa propre construction de production (`.next-test/`) et son propre serveur (port 3100,
`TEST_PORT`), avec de faux YouTube et Open-Meteo. Il affiche un bilan étape par étape et se termine en erreur si une
étape échoue.

| Commande | Effet |
|---|---|
| `npm test` | tests unitaires et d’intégration |
| `npm run test:unit` | tests unitaires : logique pure, sans base (quelques secondes) |
| `npm run test:integration` | tests d’intégration : Payload complet sur la base `swatter_tests`, recréée à chaque lancement (environ 2 min 30) |
| `npm run test:e2e` | tests de bout en bout contre un serveur déjà démarré (voir plus bas) |
| `npx vitest` | tests unitaires et d’intégration relancés à chaque modification, pendant le développement |

Écrire un test (outils, conventions) : voir [DEV_NOTES.md](DEV_NOTES.md), « Tests ».

### Ce qui est vérifié

- **Tests unitaires** (`tests/unit/`, 821 tests, quelques secondes) : la logique pure du site.
  - Espace membres et sécurité : validation des champs, mots de passe, jetons et sessions signées, limites anti-abus,
    retours après la connexion et sortie de l’aperçu (près de 300 tentatives de redirection vers un autre site), e-mails,
    export CSV (formules de tableur neutralisées).
  - Dates en heure de Paris (changements d’heure, minuit, 29 février), programme TV et journées TV de 2 h à 2 h, recopie
    de la grille.
  - Météo (lecture et import d’Open-Meteo, bulletins), sources vidéo (YouTube, Twitch, Bunny), import de la chaîne
    YouTube, recherche (classement, accents).
  - Règles d’accès de chaque collection, tableau de bord, agenda, info, webcams, bandeau cookies, menus, médias, anciennes
    adresses, comportements automatiques (régénération du site, Top 10, vignette YouTube), formulaire de contact.
- **Tests d’intégration** (`tests/integration/`, 398 tests, environ 2 min 30) : Payload complet sur la base de test.
  - Droits du public, des éditeurs et des administrateurs sur chaque collection et chaque réglage (REST et GraphQL),
    brouillons, contenus programmés, comptes de l’équipe, membres.
  - Comportements automatiques : adresses uniques, Top 10, vignettes YouTube, grille des programmes, régénération du site,
    ménage des brouillons vides.
  - API de l’espace membres (inscription, connexion et blocage, sessions, mot de passe oublié, historique, « Ma liste »,
    export, suppression), formulaire de contact, recherche, tâche planifiée, imports, recopie de la grille, export de la
    lettre d’info.
- **Tests de bout en bout** (`tests/e2e/`, 143 tests, environ 6 minutes, dans les projets `bureau` 1440 × 900 et `mobile`
  390 × 844, tactile ; ceux qui ne dépendent pas de l’écran, comme le référencement et l’administration, une seule fois) :
  - `pages.spec.ts` : chaque adresse répond 200 (404 pour une adresse inconnue), un seul `h1`, aucun débordement
    horizontal, aucune erreur JavaScript, de console (hydratation comprise) ni réponse HTTP en erreur, langue, URL
    canonique et JSON-LD valides ; administration et API joignables ; tâche planifiée refusée sans secret ;
  - `rubriques.spec.ts` : contenu de chaque rubrique (accueil complet, info, météo, programme TV, agenda, webcams,
    vidéos, replay, direct, recherche, page éditoriale et redirections) ;
  - `parcours.spec.ts` : parcours d’un visiteur (météo, programme TV au clavier, recherche au clavier, filtres et pages de
    l’agenda et de l’info, lecteur vidéo, plein écran des webcams, « Ma liste », refus des cookies) ;
  - `accessibilite.spec.ts` : audit axe-core (WCAG 2.1, niveaux A et AA) de 22 pages et de leurs états ouverts (bandeau
    cookies, recherche, menu mobile, formulaires en erreur, « Mon espace ») ;
  - `seo.spec.ts` : plan du site, robots.txt, balises de chaque page principale dans le HTML du serveur, en-têtes de
    sécurité, pages non indexées ;
  - `interactions.spec.ts` : recherche au clavier, bandeau cookies, menu mobile, lien d’évitement ;
  - `contact.spec.ts` : bouton « Proposer une info », champs vérifiés, robots ignorés ;
  - `members.spec.ts` : espace membres fermé sans connexion, inscription, mot de passe oublié, retours sûrs après la
    connexion, pages lisibles sur mobile ;
  - `admin.spec.ts` (bureau, en série) : tableau de bord, aide, grille et recopie de semaine, Top 10, éditeurs,
    brouillons et aperçu en direct, direct Twitch, import YouTube (faux YouTube), blocage après 5 mauvais mots de passe,
    parcours complet d’un membre et sa gestion dans « Membres du site ».

### Tests de bout en bout contre un serveur déjà démarré

```bash
# Serveur de développement ou de production, base remplie par npm run seed :
E2E_BASE_URL=http://localhost:3000 npx playwright test
# Ou construction de production puis tests (« npm run start » est lancé automatiquement) :
npm run build && npm run test:e2e
# Import de la chaîne YouTube, avec un faux YouTube local (tests/e2e/youtube-mock.ts) : serveur lancé avec
# YOUTUBE_BASE=http://127.0.0.1:8765 YOUTUBE_THUMB_BASE=http://127.0.0.1:8765/vi, puis
E2E_YOUTUBE_MOCK_PORT=8765 E2E_BASE_URL=http://localhost:3000 npx playwright test
```

Ces tests écrivent dans la base du serveur visé (comptes de membres `e2e-…@example.com`, messages, brouillons, qu’ils
suppriment en partie) : préférez `npm run test:complet -- --e2e`, qui utilise sa propre base. Identifiants de
l’administration : `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (par défaut ceux qu’`init-db` crée sans `ADMIN_EMAIL` :
admin@swatter-tv.fr / swatter-admin-2026) ; sans compte
valide, les tests de l’administration sont ignorés. Les adresses de détail sont lues dans l’API REST : sans données, les
tests concernés sont ignorés. Le Chromium de Playwright ne décode pas le H.264 : les MP4 de démonstration y apparaissent
en « Vidéo indisponible » ; les tests vérifient donc la présence du lecteur, pas la lecture. Options utiles :
`--project=mobile`, `-g agenda`, `--ui`.
