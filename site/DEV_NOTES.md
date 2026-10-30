# Notes de développement — site Swatter TV Info

## Pile technique

- **Next.js 16.3** (App Router, React 19, Turbopack) + **Payload CMS 3.91** intégré (admin sur `/admin`, API sur `/api`).
- **PostgreSQL** (`@payloadcms/db-postgres`). En développement, le schéma suit le code (`push`) ; en production, migrations.
- Styles : **CSS natif** avec les tokens de la maquette (`src/styles/globals.css`) et un fichier par rubrique (`src/styles/<rubrique>.css`).
- Référence visuelle et comportementale : **`../maquette/index.html`** (HTML, CSS et JS de la maquette validée par le client).

## Arborescence

```
src/
  app/(frontend)/         pages publiques (layout.tsx, page.tsx = accueil)
  app/(payload)/          administration et API Payload (fichiers générés, ne pas modifier)
  collections/ globals/   modèle de données (figé : ne pas modifier sans accord)
  components/ui/          primitives partagées (Icon, Rail, RailArrows, Seg, SectionHead, PageHeader, MediaImage, JsonLd, Effects)
  components/<rubrique>/  composants de chaque rubrique
  lib/                    helpers (payload, safe, media, format, video, site, departments, categories, queries/)
  lib/import/             imports automatiques (météo, chaîne YouTube)
  lib/members/            espace membres : API, sessions, mots de passe, e-mails, limites (voir « Espace membres »)
  components/members/     espace membres côté site (formulaires, Mon espace, « Ajouter à ma liste », historique)
  styles/                 globals.css + un fichier par rubrique
  scripts/                scripts Payload (init-db, seed, import)
deploy/                   serveur de production (DEPLOIEMENT.md) : installer.sh, emails.sh, bascule.sh, mise-a-jour.sh,
                          restaurer.sh ; serveur.yml (Caddy dans Docker Compose, via COMPOSE_FILE de .env) et caddy/
scripts/                  sauvegarde.sh (chaque nuit sur le serveur), dev.mjs, test-complet.mjs
```

## Conventions

- **Données côté serveur** : `const payload = await getPayloadClient()` puis l'API locale (`payload.find`, `findGlobal`…),
  toujours dans `safe(() => …, valeurParDéfaut, 'libellé')` pour que le build fonctionne sans base.
  Utiliser `depth: 1` pour charger les médias liés, `limit` raisonnable, `sort`, et `select` quand c'est utile.
- **Rendu** : composants serveur par défaut. `'use client'` uniquement pour l'interactivité ; ne passer aux composants
  client que des données sérialisables (chaînes, nombres, objets simples, dates en ISO).
- **Pages** : `export const revalidate = 60`. Routes dynamiques : `generateStaticParams` renvoie `[]` et `dynamicParams = true`
  (pages générées à la première visite puis mises en cache). Les `params` sont des **Promise** (Next 16) :
  `({ params }: { params: Promise<{ slug: string }> })` puis `const { slug } = await params`. `notFound()` si absent.
- **SEO** : `generateMetadata` en utilisant les champs du plugin SEO (`doc.meta?.title`, `doc.meta?.description`, `doc.meta?.image`)
  avec repli sur titre / chapô / image. Données structurées via `<JsonLd data={…} />`. URL canoniques via `alternates.canonical`.
  La mise en page commune ne définit **ni canonique ni `og:url`** : chaque page indexable déclare les siennes
  (`alternates.canonical`, `openGraph.url`), sinon elle désignerait l'accueil ; les pages non indexées n'en ont pas.
  Nouvelle page indexable : l'ajouter aussi à `src/app/sitemap.ts`.
- **Images** : `<MediaImage media={doc.image} size="card" sizes="…" />` (next/image, AVIF/WebP). `priority` seulement pour l'image principale.
- **Image à source mobile** : `<MediaImage … mobile={{ media, size, sizes, fallbackSrc?, position? }} />` rend une `<picture>`
  (getImageProps) avec une source `MOBILE_MEDIA` (max-width: 760px). Le cadrage de chaque source passe par les variables
  CSS `--focal` et `--focal-m` (classe `.img-mobile`, globals.css), jamais par un style en ligne, qui vaudrait pour les deux
  sources. `priority` y donne `loading="eager"` et `fetchPriority="high"`, sans preload : une seule image est téléchargée,
  celle de la source retenue. Le `sizes` doit refléter la largeur réellement affichée (`coverWidth` : une image qui couvre
  un cadre plus haut que large est plus large que lui).
- **Dates** : tout affichage en heure de Paris via `src/lib/format.ts` (`formatTime`, `formatDayLong`, `dateChip`, `timeAgo`, `parisDay`, `parisDateTime`).
- **Vidéo** : `resolveVideo(source)` (`src/lib/video.ts`) puis `<VideoPlayer video={…} />`.
- **CSS** : reprendre les classes de la maquette (`.card`, `.media`, `.badge`, `.seg`, `.sec-head`, `.rail`…). Les styles communs sont
  dans `globals.css` ; ceux d'une rubrique dans `src/styles/<rubrique>.css`, importé en tête du composant qui en a besoin
  (`import '@/styles/meteo.css'`). Penser au responsive (≤ 1100 px, ≤ 760 px) et à `prefers-reduced-motion`.
- **Révélation au défilement** : ajouter l'attribut `data-reveal` (et `style={{ '--d': i } as CSSProperties}` pour décaler) ;
  `Effects` (monté dans le layout) s'occupe du reste. Halo des cartes : automatique sur `.card` et `.tile`.
- **Performance** : animer uniquement `transform` et `opacity`, mettre en pause hors écran (IntersectionObserver) et onglet caché,
  pas de nouvelle dépendance npm, pas de flou (`backdrop-filter`) au-dessus d'une image animée.
- **Accessibilité** : textes alternatifs, `aria-label` sur les boutons-icônes, navigation clavier, contraste, `prefers-reduced-motion`.
- **Langue** : tout le texte visible est en français.

## Contrats entre rubriques

Chaque composant ci-dessous existe déjà (stub) avec sa signature ; il peut être importé avant d'être implémenté.

| Composant | Rôle |
|---|---|
| `layout/Header`, `Footer`, `TabBar`, `CookieBanner`, `AdSlot({placement})`, `SocialBand` | coque du site |
| `search/SearchOverlay` | recherche plein écran ; s'ouvre au clic sur tout élément `[data-open-search]` ou touche `/` |
| `home/Hero`, `Ticker`, `Une` | haut de l'accueil |
| `meteo/MiniMeteo`, `MeteoWidget({variant: 'aside' \| 'full'})` | météo (en `aside`, ne rend rien sans prévision ; `MiniMeteo` non plus) |
| `video/VideoPlayer({video, poster, posterPosition, preview, title, autoPlay, live, history})`, `Top10Section`, `VideosSection`, `ReplaySection` | vidéos |
| `info/InfoSection` | info de l'accueil (contient `MeteoWidget variant="aside"`) |
| `programme/TvGridSection({variant: 'home' \| 'full', day?})` | grille TV (`day` = AAAA-MM-JJ, page /programme-tv) |
| `agenda/AgendaSection`, `webcams/WebcamsSection({limit})` | agenda, webcams |
| `lib/import/meteo.ts → importMeteo(payload)`, `lib/import/youtube.ts → importYoutube(payload)` | imports (appelés par `GET /api/cron/import`) |
| `lib/search.ts → search(payload, q, limit)` | recherche (appelée par `GET /api/search?q=`) |
| `seo/SiteJsonLd` | données structurées du site (monté dans le layout) |

## Briques partagées (prêtes à l'emploi)

| Fichier | Contenu |
|---|---|
| `lib/queries/schedule.ts` | `Slot`, `toSlot`, `getScheduleBetween(from, to)`, `getOnAir(now, n)` : créneaux de la grille (sérialisables) |
| `lib/urls.ts` | `articleUrl`, `videoUrl`, `replayUrl`, `eventUrl`, `webcamUrl`, `programUrl`, `pageUrl`, `departmentUrl` : **toujours** les utiliser pour les liens |
| `lib/meteo-types.ts` | `Forecast`, `ForecastDay`, `ForecastCity`, `WeatherKind`, `isForecast` : format du champ `forecast` du global météo |
| `components/ui/RichText` | rendu du contenu riche Lexical (classe `.prose`) |
| `public/visuels/*.webp` | visuels de la maquette, servis en `/visuels/<nom>.webp` : images de repli quand un contenu n'a pas d'image |
| `seed/assets/videos/direct-mont-blanc.mp4` | clip d’exemple du direct (contenus de départ) |
| `agenda/EventCard({event, now, variant: 'row' \| 'poster'})` | carte d'événement réutilisable |
| `webcams/LiveClock`, `webcams/WebcamPlayer({cam})` | horloge de Paris partagée (un seul minuteur), lecteur de webcam selon la source |
| `lib/queries/events.ts` | `upcomingWhere`, `getUpcomingEvents`, `getAgendaHighlights`, `getEventBySlug` |
| `lib/queries/webcams.ts` | `getActiveWebcams` |
| `search/rubriques.ts` | `RUBRIQUES` (liste des rubriques et icônes), `searchPageUrl(q)` |
| `programme/model.ts` | `tvDay()` (journée TV : la nuit jusqu'à 2 h appartient à la veille), `programmeDayUrl(day, today)` |

## Adresses du site

| Adresse | Page |
|---|---|
| `/` | accueil |
| `/direct` | le direct |
| `/info`, `/info/[departement]`, `/info/[departement]/[slug]` | l'info de toute la région, par département (12 départements d'Auvergne-Rhône-Alpes, `src/lib/departments.ts` ; un autre est en 404), article |
| `/meteo/[departement]`, `/webcams/[departement]`, `/agenda?departement=` | météo (ville du département), webcams et agenda d'un département |
| `/contact` | formulaire « Proposer une info » (`?sujet=publicite` présélectionne la publicité) |
| `/meteo` | la météo |
| `/agenda`, `/agenda/[slug]` | agenda, événement |
| `/programme-tv` | programme TV |
| `/replay`, `/replay/[slug]` | replay, émission rediffusée |
| `/videos`, `/videos/[slug]` | vidéos, vidéo |
| `/webcams` | webcams |
| `/recherche?q=` | résultats de recherche |
| `/[...slug]` | pages éditoriales (canaux de réception, le groupe, crédits, vie privée, mentions légales) et redirections des anciennes adresses |
| `/inscription`, `/connexion`, `/mot-de-passe-oublie` | espace membres : créer un compte, se connecter, recevoir un lien de nouveau mot de passe |
| `/compte`, `/compte/historique`, `/compte/ma-liste`, `/compte/profil` | « Mon espace » (membre connecté, sinon `/connexion?retour=<chemin>`) |
| `/compte/nouveau-mot-de-passe?token=` | lien de l'e-mail « mot de passe oublié » des membres |
| `/api/compte/…`, `/api/membres/lettre-info.csv` | API des membres ; export CSV de la lettre d'info (administrateurs) |
| `/admin`, `/api` | administration et API Payload |

## Commandes

```bash
npm run dev            # développement (http://localhost:3000, admin sur /admin)
npm run build          # build de production
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run payload run src/scripts/init-db.ts   # tables + premier administrateur
npm run seed           # contenus de départ « Exemple » (efface les contenus)
npm run test:unit      # tests unitaires (quelques secondes, sans base)
npm run test:integration   # tests d'intégration (Payload sur la base <base>_tests, recréée)
npm run test:complet   # avant une livraison : TypeScript, ESLint, tests unitaires, d'intégration et de bout en bout
```

## Tests

Trois niveaux ; commandes, prérequis et contenu : README, « Tests ». Avant une livraison : `npm run test:complet`.

- **Unitaires** (`tests/unit/*.test.ts`, Vitest, environnement node) : logique pure de `src/`, sans base ni réseau ni
  écriture sur le disque. Dates figées par `vi.useFakeTimers()` puis `vi.setSystemTime()` (heure de Paris, changements
  d'heure). Une fonction interne à tester est exportée (`export` seulement, sans autre changement).
- **Intégration** (`tests/integration/*.test.ts`) : Payload complet sur une base dédiée `<base>_tests`, recréée vide à
  chaque lancement par `global-setup.ts` (schéma par `push` dans un processus à part, puis les comptes ADMIN et EDITOR
  d'`accounts.ts`). Les fichiers passent l'un après l'autre, avec une seule instance de Payload (`testPayload()`). Outils
  d'`helpers.ts` :
  - `api(chemin, { method, body, cookie, token, origin, headers })` appelle l'API REST (`/api…`) par `handleEndpoints` de
    Payload, sans serveur : authentification, droits, hooks et routes personnalisées comme sur le site ; `apiJson()` lit
    aussi le corps. L'en-tête `Origin` du site est ajouté aux requêtes qui modifient (`origin: null` pour l'omettre) ;
  - `CookieJar` suit les cookies comme un navigateur (sessions des membres) ;
  - `adminToken()`, `editorToken()` (en-tête `Authorization: JWT …`) ; `unique(préfixe)` pour des données uniques.

  Les limites anti-abus de l'espace membres comptent par adresse IP : un en-tête `x-forwarded-for` différent par test.
  Pas de SMTP : les e-mails ne partent pas, `vi.spyOn(payload, 'sendEmail')` pour les vérifier. Faux services :
  `startOpenMeteoMock(port)` (`tests/mocks/open-meteo.mjs`) et `startYoutubeMock(port)` (`tests/e2e/youtube-mock.ts`),
  sur les ports de `vitest.config.ts` (`TEST_METEO_MOCK_PORT`, `TEST_YOUTUBE_MOCK_PORT`). `TEST_DATABASE_NAME` change le
  nom de la base (deux lancements en même temps). Payload ne ferme pas son pool PostgreSQL à `destroy()` :
  `closePayload()` (appelé par `setup.ts`) le ferme, avec un délai maximal, sans quoi Vitest ne se termine pas.
- **Bout en bout** (`tests/e2e/*.spec.ts`, Playwright, projets `bureau` et `mobile`) : contre un site de production.
  `npm run test:complet` en construit un à part (`.next-test`, port 3100) sur la base `<base>_e2e`, remplie par les
  migrations, `init-db` et les contenus de départ, avec de faux YouTube et Open-Meteo. Outils de `tests/e2e/helpers.ts` :
  `watchErrors` (erreurs JavaScript, console, réponses HTTP en erreur), `expectNoHorizontalOverflow`, `expectSeo`,
  `settle`, `linksMatching`, `expectPlayer`, `firstDoc`. Connexion administrateur par l'API, dans un `describe` en série
  (les sessions Payload d'un même compte s'écrasent). Accessibilité : `@axe-core/playwright`. Le Chromium de Playwright
  ne décode pas le H.264 : `apercus.spec.ts` vérifie la demande du fichier d'aperçu, pas l'image animée.
- **Copie git (worktree) dont `node_modules` est un lien symbolique** : Turbopack refuse de démarrer ; utiliser
  `npx next dev --webpack -p <port>`.
- **Variables lues par le site pour les tests** : `MEDIA_DIR` (dossier des médias, `media/` par défaut), `NEXT_DIST_DIR`
  (dossier de construction, `.next` par défaut ; un autre dossier utilise `tsconfig.next-test.json`, pour que la
  construction ne réécrive pas `tsconfig.json`), `MEMBER_RATE_FACTOR`, `OPEN_METEO_URL`, `YOUTUBE_BASE`,
  `YOUTUBE_THUMB_BASE`.
- **Versions** : Vitest 4 et Vite 7 (`overrides` de `package.json`) : Vitest 5 et Vite 8 font échouer `npm install`
  (« Cannot read properties of null (reading 'edgesOut') »).

## Notes d'intégration (mises à jour en cours de développement)

- **Mesure d'audience (Google Analytics 4)** : ID de mesure dans les réglages (`settings.analytics.measurementId`, onglet
  « Mesure d'audience », modifiable par les administrateurs, vérifié par `isMeasurementId()` de `lib/analytics.ts` : il
  finit dans l'adresse du script). `layout/CookieConsent.tsx` (serveur) rend le bandeau et, si un ID est saisi et hors
  mode aperçu, `analytics/Analytics.tsx` (client). Celui-ci lit le choix au montage (`readConsent()`, puis
  `onConsentChange`) et non par `useConsent()`, qui vaut null pendant l'hydratation : les cookies d'un visiteur qui a
  accepté seraient effacés à chaque page. Accord « audience » : `initGtag` (file `dataLayer` d'objets `arguments`,
  consentement par défaut, publicité refusée, signaux Google coupés, une seule configuration par page) puis `loadGtag`
  (gtag.js, une fois). Refus, retrait ou choix expiré : `ga-disable-<ID>`, consentement « denied » et cookies `_ga…`
  effacés (`clearGaCookies`, nom d'hôte et domaine principal). Pages vues : la première par `config`, les suivantes par
  la mesure améliorée de GA4 (« changements d'historique », active par défaut sur le flux). Le choix des cookies est
  gardé 6 mois (CNIL, page Vie privée). Le test de bout en bout (`mesure-audience.spec.ts`) tourne dans un projet
  Playwright lancé après les autres : il active l'ID sur tout le site. Tableau de bord : ligne « Mesure d'audience »
  (`analyticsId` de dashboard-data) avec le lien « Voir les statistiques » vers analytics.google.com (l'ID de mesure ne
  permet pas de viser la propriété : Google demande de la choisir).
- **Pages introuvables** : `notFound()` répond 404, avec le titre et `noindex` dans le HTML du serveur, mais Next 16 envoie
  le contenu de `not-found.tsx` dans les données de la page : il s'affiche avec le JavaScript (visiteurs, Google), pas sans.
  C'est le comportement de Next 16.3 lui-même (vérifié sur une application minimale) ; `global-not-found` (expérimental)
  ne servirait qu'aux adresses qu'aucune route ne reconnaît, or `[...slug]` les reconnaît toutes.
- **Titre d'onglet des pages à paramètres** (filtres, pages suivantes, jour du programme : agenda, info, vidéos, replay,
  programme TV) : Next 16 ne garde qu'une tête de page par chemin dans son cache de navigation, si bien qu'après un clic
  sur un filtre le titre resterait celui de la première adresse préchargée (le HTML du serveur, lui, est juste). Ces pages
  rendent `<DocumentTitle title={…} />` (`components/ui/DocumentTitle.tsx`) avec le même titre que generateMetadata (sans
  le nom du site, ajouté par `pageTitle()` de `lib/site.ts`, aussi modèle de la mise en page). Désactiver le préchargement
  des liens ne suffit pas : le menu précharge aussi ces pages.
- **Images** : `mediaUrl()` renvoie un **chemin local** (`/api/media/file/…`) pour que next/image optimise les fichiers
  (AVIF/WebP, srcset). Pour une URL absolue (JSON-LD, flux) : `absoluteUrl(mediaUrl(doc.image, 'card'))`
  (`absoluteUrl` laisse intactes les URL déjà absolues). `mediaFocal()` ne renvoie rien pour le centre par défaut (50 % 50 %) :
  le cadrage CSS de chaque rubrique (`object-position`) s'applique tant qu'aucun point focal n'a été choisi.
  `mediaFocal(m, size)` donne la position du point focal dans la déclinaison affichée : Payload découpe card, poster et og
  autour de ce point à l'envoi, `focalIn` refait ce calcul ; sans `size`, c'est le point de l'original. `focalCover(m,
  frameRatio, size?)` centre le point dans un cadre aux proportions connues, collé au bord si nécessaire (carrousel sur
  téléphone, `heroMobileSource` dans `components/home/heroMedia.ts`).
  - Texte riche : convertisseur « upload » de `components/ui/RichText.tsx` (logique pure dans `proseUpload.ts`) : image
    d'origine ou « hero » à ses vraies proportions, `PROSE_SIZES`, crédit en légende, vidéo dans `<video controls>`.
  - Agenda : vignette mobile des cartes sur l'affiche d'origine (`posterThumbSizes`), encart vedette mobile aux
    proportions de l'affiche bornées entre 4:5 et 3:2 (`featureRatio`, `--poster-ratio`) ; tuile « Sortie du week-end »
    d'`Une.tsx` sur l'affiche d'origine.
  - Webcams : `webcamPoster().position` est appliqué par `--focal` ; le plein écran recentre l'image.
  - Lecteur vidéo : `posterPosition = mediaFocal(thumbnail, 'hero')`.
  - Publicités : `.ad__media` doit garder `width: 100%`, sinon un visuel plus petit que l'emplacement rétrécit le bloc
    après son chargement.
- **Tuile météo du bento « À la une »** (`components/meteo/MiniMeteo`) : le composant rend **la tuile entière** comme racine,
  `<article className="tile b-meteo" data-reveal style={{ '--d': 3 } as CSSProperties}>`, avec à l'intérieur la structure
  de la maquette (`.mini-meteo` > titre, `.mini-meteo__row` > `svg.wi` + `.mini-meteo__t`, libellé, min/max) et un lien
  étiré vers `/meteo` (`<Link className="stretched" href="/meteo">` sur le titre). Il renvoie `null` sans prévision : la grille
  du bento détecte la tuile avec `:has(.b-meteo)`. `src/styles/une.css` fournit déjà le placement et le fond de `.b-meteo` et les
  styles de base `.mini-meteo` ; compléter dans `meteo.css` si besoin.
- **Classes `.tile` / `.bigplay`** : définies dans `src/styles/une.css`, chargé uniquement sur l'accueil. Ailleurs, utiliser les
  cartes `.card` de globals.css (ou importer `@/styles/une.css` explicitement).
- **Consentement** (contenus externes YouTube / Bunny / iframes) : `useConsent()`, `openCookieSettings()`, `onConsentChange()`
  de `@/components/layout/consent` (composants client uniquement). L'aperçu animé est un fichier du site : pas de
  consentement. Le direct intégré (Twitch, YouTube, Bunny) se charge seul, en muet, avec l'accord « externes » ; les fiches
  YouTube restent au clic.
- **Aperçu animé (affichage)** : `src/components/video/VideoPreview.tsx` (îlot `VideoPreview` pour les cartes,
  `PlayerPreview` pour les fiches) et `preview-director.ts` (logique pure, `tests/unit/apercu-pilotage.test.ts`).
  - Un seul aperçu à la fois sur la page. À la souris : survol (150 ms) ou focus clavier, en boucle. Écran tactile : carte
    visible à 60 % la plus proche du centre, 400 ms après l'arrêt du défilement, une fois (5 s au plus), puis rejouée
    seulement après une sortie et un retour à l'écran. « feature » (Vidéo du jour) : lancée seule une fois visible.
    « hover » : petites vignettes (recherche, historique). « ambient » : lecteur de fiche, avec un bouton pause.
  - Un seul IntersectionObserver, défilement écouté en capture, arrêt quand l'onglet est masqué. Rien en
    prefers-reduced-motion ni avec saveData (`motion.ts`) ; `.vprev` est aussi masqué en CSS.
  - `<video muted playsInline preload="none" …>` : src posée au premier lancement, fondu à « playing », `play().catch`
    obligatoire (H.264 non décodé par le Chromium de Playwright), erreur → aperçu retiré.
  - Ajouter un aperçu à une carte : `{previewUrl(doc.preview) && <VideoPreview src=… />}` juste après l'image du `.media`,
    et `preview: true` dans le `select` de la requête. Les requêtes de liste ne transmettent que l'adresse (`previewUrl`).
  - `VideoPlayer` `autoPlay` (direct) : lecture sans le son quand le lecteur est visible à 60 %, bouton « Activer le son ».
    Twitch, YouTube et Bunny seulement avec l'accord « externes » (`twitchEmbedUrl(…, muted=true)` / `mutedEmbedUrl`) ;
    jamais en reduced-motion ni avec saveData. Les lectures lancées seules n'entrent pas dans l'historique.
- **JSX serveur passé en prop à un composant client** et rendu à côté d'autres enfants : lui donner une `key`
  (sinon avertissement React en développement).
- **`.sr-only` dans un rail à défilement horizontal** : mettre `position: relative` sur la carte, sinon l'élément masqué
  échappe au rognage et élargit la page.
- **Import météo** : `importMeteo()` renvoie `{ ok: false, skipped: true }` quand la mise à jour automatique est désactivée
  (ce n'est pas une erreur). En production, lancer `npm run import` une fois puis brancher la tâche planifiée `GET /api/cron/import`.
  Villes suivies : `METEO_CITIES` (`src/lib/meteo.ts`), une par département (`department`), la première (Annecy) étant la
  ville principale ; chaque jour garde le détail de la ville principale et, dans `views`, celui des autres villes (pages
  `/meteo/[departement]`, `getMeteo(dept)` dans `src/components/meteo/data.ts`) ;
  une prévision enregistrée n'affiche que ces villes (les autres sont ignorées jusqu'au prochain import).
- **Ne jamais faire varier le `className` d'un élément `[data-reveal]`** dans un composant client : React réécrit `class`
  et efface `is-in`, l'élément redevient invisible. Utiliser un attribut `data-*` ou un élément enfant.
- **Open Graph** : une page qui définit `openGraph` sans `images` perd l'image par défaut (`opengraph-image` du groupe
  `(frontend)`, dont l'adresse est suffixée) : reprendre `images: (await parent).openGraph?.images ?? []` ou fournir une image.
- **Redirections** : les anciennes adresses sont dans `next.config.ts` (`redirects()`), à recopier dans `LEGACY` de
  `[...slug]/legacy.ts` (un test le vérifie) ; les variantes qui ne diffèrent que par la casse ou les accents passent par
  `[...slug]` (la correspondance de `next.config.ts` est insensible à la casse et bouclerait). À eux deux, ils couvrent les
  39 adresses du plan de l’ancien site (sitemap.xml de SiteW, octobre 2026).
  Limite connue : ces variantes perdent leurs paramètres (`/Agenda?quand=week-end` → `/agenda`), car la page attrape-tout
  ne lit pas `searchParams` pour rester en cache ; les redirections de `next.config.ts`, elles, les gardent.
- **Recherche** : « webcam(s) », « caméra »… désignent la rubrique : ces mots (et les petits mots autour) sont retirés de la
  requête des webcams (`WEBCAM_WORDS` dans `src/lib/search.ts`), « webcams » seul les donne toutes. `ILIKE` sans index, suffisant à cette échelle ; pour de gros volumes, ajouter un index trigramme (pg_trgm).
  `SearchHit.image` peut être une URL distante : l'afficher avec `unoptimized`.
- **Pages qui lisent `searchParams`** (filtres, pagination) : pas de `generateStaticParams` sur la même route. En production,
  une page prégénérée qui lit `searchParams` lève `DYNAMIC_SERVER_USAGE` (erreur 500), alors que tout fonctionne en développement.
  Toujours vérifier les pages avec `npm run build && npm start`.
- **Panne de la base** : `safe()` relance les erreurs de connexion hors build (Next garde alors la dernière version en
  cache des pages ISR, et la page d'erreur `(frontend)/error.tsx` s'affiche pour une page jamais mise en cache).
  Les requêtes de la mise en page commune (réglages, pied de page) passent `{ outage: 'fallback' }` pour que l'en-tête et le
  pied de page restent affichés. `src/app/global-error.tsx` est la page de dernier recours.
- **Fiche d'émission par ancre** (`/programme-tv#slug`) : à la fermeture, l'ancre est retirée de l'adresse (un nouveau lien
  vers la même émission la rouvre).
- **Contenus programmés** : articles, vidéos (date de publication) et replays (date de diffusion) dans le futur restent
  invisibles sur le site et dans l'API publique ; l'équipe connectée les voit dans l'administration.
- **Brouillons** (`versions: draftVersions`, `src/fields/drafts.ts`) : toutes les collections du site (vidéos, articles,
  événements, replays, pages, grille, émissions, webcams, publicités) et les globals `settings` et `meteo`. Écritures par
  code (seed, recopie de semaine, imports) : `_status: 'published'`. Enregistrement automatique en brouillon (table des versions seulement), mise en ligne par
  « Publier les modifications » (ligne principale). Toute lecture du site passe par `getPayloadClient()`, qui enveloppe
  Payload dans `publicationAware()` (`src/lib/publication.ts`) : hors aperçu, `find` / `count` / `findDistinct` sur ces
  collections ajoutent `_status = published` ; en aperçu, `find` et `findGlobal` passent `draft: true` (dernière version).
  Les règles d'accès anonymes (`src/access`) exigent aussi `_status = published` (API publique). Création par script ou
  import : passer `_status: 'published'` (la valeur par défaut est « brouillon »). Base créée avant les brouillons :
  `npm run payload run src/scripts/publish-existing.ts` publie les contenus qui n'ont encore aucune version.
  Avec l'enregistrement automatique, Payload crée la fiche dès l'ouverture de « Ajouter » (ce qui permet l'aperçu dès
  la première saisie) : `UntitledTitle.tsx` l'intitule « Nouvelle fiche : … » au lieu de son numéro, et la tâche horaire
  supprime les brouillons jamais publiés restés sans titre plus de 24 h (`src/lib/drafts-cleanup.ts`). Tant qu'une fiche
  n'a jamais été publiée, sa ligne principale reste vide : ses données sont dans la table des versions (`draft: true`).
- **Revalidation** (`src/hooks/revalidate.ts`) : un enregistrement de brouillon ne touche pas au cache ; publication,
  retrait du site (le statut de la ligne principale repasse à `draft`) et suppression revalident.
- **Mode aperçu** : `/apercu?chemin=/page` (connexion requise, sinon page de connexion) active le `draftMode` de Next
  (cookie de contournement du cache ISR) ; `/apercu/quitter?chemin=` le désactive. `safePath()` (`src/lib/preview.ts`)
  n'accepte que des chemins internes. `PreviewMode` (mise en page du site) : dans l'iframe de l'aperçu en direct,
  `RefreshRouteOnSave` rafraîchit la page à chaque enregistrement automatique ; dans un onglet, bandeau « Aperçu ».
  Requêtes par adresse (`src/lib/queries`) : en aperçu, pas de filtre de date (un contenu programmé se prévisualise).
- **Zone couverte** : toute la région Auvergne-Rhône-Alpes. Info, agenda et webcams portent un champ « Département »
  (`src/fields/department.ts`) et proposent un filtre par département (`src/components/ui/DeptFilter.tsx`, tournures
  « en Isère / dans le Rhône » dans `src/lib/places.ts`) ; la météo suit une ville par département.
  Une restriction à la seule Haute-Savoie a été essayée puis abandonnée à la demande du client : les adresses
  `/info/<département>` restent celles d'origine.
- **Webcams** : leur champ « Département » accepte en plus `plus` (« Web Cams + », vues hors région : Suisse, Aoste ;
  `WEBCAMS_PLUS`, `WEBCAM_ZONES` dans `src/lib/departments.ts`), avec sa page `/webcams/plus` et sa section sous la
  grille de `/webcams`. Lien du flux et image facultatifs : sans lien, la webcam s'affiche « Bientôt en direct »
  (`isComingSoon()`, lecteur `ComingSoon`), sans plein écran ; l'accueil montre d'abord les webcams en direct. Les 14
  webcams de la chaîne sont dans `src/scripts/seed/webcams.ts` (seed et `npm run webcams`, qui ajoute seulement celles
  qui manquent).
- **Formulaire de contact** : `POST /api/contact` (payload.config.ts) → champ piège `website` et délai minimal de 3 s
  (`elapsed`, mesuré par le navigateur) pour les robots (réponse `{ok:true}` sans rien faire), validation partagée client/serveur
  (`src/lib/contact.ts`), puis 5 messages valides par IP et par quart d'heure (mémoire du processus). `sendContact`
  (`src/lib/contact-send.ts`) enregistre d'abord dans la collection `messages` (création réservée au serveur), puis
  envoie l'e-mail (`replyTo` = l'expéditeur) à `settings.contact.email`, à défaut `contact@swatter-tv.fr` ; `emailed`
  n'est coché que si SMTP est configuré et l'envoi réussi.
- **Mot de passe oublié** : e-mail en français (`Users.ts`, `auth.forgotPassword`), lien `/admin/reset/<jeton>` valable
  1 h. Comme le formulaire de contact, il demande `SMTP_HOST` (voir README) pour partir vraiment.
- **Import YouTube** : `destination()` (`src/lib/import/youtube.ts`) range les Shorts et les vidéos de 60 s ou moins dans
  « Vidéos », celles d'au moins `replayMinutes` (fiche Chaîne YouTube, 20 min par défaut) dans « Replays » (émission
  devinée par `matchProgram()` : titre commençant par le nom de l'émission), le reste dans « Vidéos ». La durée vient du
  flux RSS si présente, sinon de la page `watch` (`lengthSeconds`).
- **Tests et connexions** : Payload garde les sessions dans la fiche de l'utilisateur ; deux connexions simultanées au
  même compte peuvent s'écraser. Seul `admin.spec.ts` (en série) se connecte en administrateur.

## Espace membres

Comptes des visiteurs (« Mon espace ») : historique des vidéos et replays regardés, « Ma liste » (vidéos, replays,
articles, événements), département préféré (météo, info, sorties), profil, export et suppression des données.

- **Sessions séparées de l'authentification Payload.** Les membres ne sont pas une collection `auth` : la session est un
  cookie signé `sw_membre` (`v1.<données>.<HMAC-SHA-256>`, clé dérivée de `PAYLOAD_SECRET`, 30 jours, `HttpOnly`,
  `SameSite=Lax`, `Secure` si `NEXT_PUBLIC_SITE_URL` est en HTTPS) qui porte l'identifiant du membre et sa
  `sessionVersion` ; incrémenter celle-ci (déconnexion « partout », nouveau mot de passe, compte suspendu, e-mail changé
  dans l'administration) invalide toutes ses sessions. `sw_connecte` est un simple témoin lisible par le navigateur :
  il permet aux pages en cache (ISR) d'afficher « Mon espace » sans lire la session côté serveur ; il ne donne aucun
  droit. **Aucun `req.user`** : un membre n'a aucun accès à `/admin` ni à l'API REST de Payload, et les règles
  `src/access` ne le voient pas.
- **Modules** (`src/lib/members/`) : `shared.ts` (constantes, types, validation commune navigateur / serveur),
  `browser.ts` (`useMemberHint`, `notifyMemberChange`, `memberApi`), `session.ts` (cookies, `getCurrentMember()` pour les
  pages serveur, `toProfile()` : ne jamais renvoyer le document brut, qui contient les empreintes), `crypto.ts`
  (scrypt N = 16384, r = 8, p = 1 ; jetons à usage unique dont seule l'empreinte SHA-256 est enregistrée ; signature des
  sessions), `items.ts` (`loadItems()` : contenus de l'historique et de la liste prêts à afficher, publics seulement
  sauf `publicOnly: false` pour les statistiques de l'équipe), `emails.ts`, `rate-limit.ts`, `endpoints.ts` (API).
- **Collections** : `members` (`src/collections/Members.ts` ; lecture, modification et suppression par les
  administrateurs, création impossible par l'API : seul `/api/compte/inscription` crée, par l'API locale ; champs
  techniques `hidden`), `member-history` et `member-favorites` (`src/collections/MemberActivity.ts` ; une ligne unique par
  membre × contenu : `kind` + `itemId`, date `watchedAt` / `savedAt` rafraîchie à chaque lecture ou ajout ; masquées du
  menu, aucun accès par l'API REST ou GraphQL, même pour les administrateurs : seulement l'API locale avec
  `overrideAccess`). Supprimer un membre supprime son activité (`beforeDelete`). Réglage : `settings.members.signupOpen`.
- **Écritures partielles.** L'API des membres écrit avec `payload.db.updateOne()` (fonction `write()` de
  `endpoints.ts`) : seules les colonnes données changent, `{ $inc: 1 }` incrémente `sessionVersion` en base. Un
  `payload.update()` réécrirait le document entier tel qu'il a été lu au départ (champs masqués compris) et annulerait
  une écriture faite entre-temps : un PATCH du profil en boucle pouvait ainsi défaire un changement de mot de passe ou
  une suspension. Ces écritures ne passent par aucun hook. Dans l'administration (hook `beforeChange`, requêtes avec
  `req.user`), `historyPaused`, `lastLoginAt` et `consentAt` ne sont jamais modifiés et l'accord `newsletter` peut être
  retiré mais pas donné : une fiche restée ouverte n'écrase pas les choix faits entre-temps par le membre. Changer
  l'e-mail ou suspendre un compte invalide aussi un lien « nouveau mot de passe » encore valable.
- **Blocage après 5 erreurs** : `reserveAttempt()` compte l'essai de connexion en une seule requête SQL (`update … where
  lock_until is null or lock_until <= now() returning id`) AVANT de vérifier le mot de passe. Adresse sans compte :
  mêmes règles en mémoire (`reserveUnknown()`), et un mot de passe vide répond 401 sans rien compter, pour que ni le code
  ni la durée de la réponse ne disent si l'adresse est inscrite. Le mot de passe actuel demandé par `/mot-de-passe` et
  `/supprimer` a son propre compteur par membre (`allowCurrentPassword()`, 5 par quart d'heure) : les essais de connexion
  d'un tiers ne bloquent pas ces actions.
- **Écritures conditionnelles** (`writeIf()` : `update … where id = … and <état lu> returning`) : le lien « nouveau mot
  de passe » n'est enregistré et envoyé que si l'adresse n'a pas changé entre-temps. Suppression du compte :
  sessions fermées d'abord, puis jusqu'à trois essais (une ligne d'historique ajoutée au même instant bloque la clé
  étrangère). Restent tolérés : « Ma liste » peut dépasser 500 de quelques lignes sur des ajouts simultanés, et une fiche
  ouverte dans l'administration puis enregistrée tard peut encore retirer un accord e-mail donné entre-temps (dans le
  sens sûr : jamais en ajouter un).
- **Inscription sans confirmation d'e-mail** (choix du client) : prénom, e-mail et mot de passe ; le compte est créé
  actif et la réponse pose les cookies de session. L'adresse n'est donc pas vérifiée, et une adresse déjà inscrite est
  signalée (`code: 'exists'`) : c'est inévitable sans e-mail de confirmation (limite : 10 inscriptions par heure et par
  IP). Département et accord pour les e-mails se choisissent ensuite dans le profil. Les colonnes de l'ancienne
  confirmation (`verified`, `verify_token_hash`, `verify_token_expires`) sont retirées par `npm run maj-base`.
- **Mot de passe oublié** répond avant de chercher le compte (`later()` : `after()` de Next.js), pour que la durée de la
  réponse ne dise pas si l'adresse est inscrite.
- **API** (`/api/compte/…`, JSON, erreurs `{ error, code? }` ou `{ errors: { champ: message } }`) :

| Méthode et chemin | Rôle |
|---|---|
| `POST /inscription` | `{ firstName, email, password }` → compte actif et cookies de session ; 400 `{ errors }` (champs) ou `code: 'exists'` (adresse déjà inscrite) ; piège `website` et durée `elapsed` (≥ 3 s, mesurée par le navigateur) ; 403 `closed` si inscriptions fermées |
| `POST /connexion` | cookies de session ; 401 identifiants ; 403 `blocked` ; 429 `locked` (5 erreurs → 15 min) |
| `POST /deconnexion` | `{ partout: true }` ferme aussi les autres appareils |
| `POST /mot-de-passe-oublie` | toujours `{ ok }` |
| `POST /nouveau-mot-de-passe` | `{ token, password }` → connecté ; `invalid` si lien expiré ou déjà utilisé |
| `GET /moi`, `PATCH /profil`, `POST /mot-de-passe` | profil (`MemberProfile`), modification, changement de mot de passe (autres appareils déconnectés) |
| `POST` / `DELETE /historique` | ajout (contenu public uniquement ; `{ paused: true }` si historique en pause), retrait d'une entrée ou de tout |
| `GET` / `POST` / `DELETE /favoris` | « Ma liste » (500 au plus, 409 au-delà) |
| `GET /export`, `POST /supprimer` | données du membre en JSON ; suppression du compte (mot de passe exigé) |

  Les requêtes qui modifient quelque chose doivent venir du site (`sameOrigin()` : en-tête `Origin`, à défaut
  `Sec-Fetch-Site`), en plus de `SameSite=Lax`. Historique limité à 200 entrées par membre (les plus anciennes sont
  effacées, `HISTORY_MAX`). `GET /api/membres/lettre-info.csv` (administrateurs Payload) : membres non suspendus qui
  acceptent les e-mails ; CSV `;` avec BOM UTF-8 (Excel) ; une valeur qui commence par = + - @ est
  précédée d'une apostrophe (sinon Excel l'exécuterait comme une formule).
- **Limites par IP** (`rate-limit.ts`, mémoire du processus) : inscription, connexion, mot de passe oublié, nouveau mot de passe, changement de mot de passe, suppression. **`MEMBER_RATE_FACTOR`** les multiplie
  (tests de bout en bout : `10`, toutes les requêtes venant de la même adresse). IP = dernier maillon de
  `X-Forwarded-For` (celui du reverse proxy ; `TRUSTED_PROXY_HOPS` s'il y en a plusieurs en chaîne, voir README).
  Le formulaire de contact utilise la même fonction (`allow('contact', …)`, 5 messages par quart d'heure).
- **E-mails** : `payload.sendEmail` (SMTP du site). Sans `SMTP_HOST` et hors production, `sendMemberEmail()` écrit le
  lien de nouveau mot de passe dans le journal (`[swatter] (développement, pas de SMTP) … — lien : …`) pour tester.
- **Pages** (`src/app/(frontend)/inscription`, `connexion`, `mot-de-passe-oublie`, `compte/…`) :
  `export const dynamic = 'force-dynamic'`, `robots: { index: false, follow: false }`, hors du plan du site. Chaque page
  de « Mon espace » vérifie elle-même le membre (`getCurrentMember()`) et renvoie vers `/connexion?retour=<chemin>`
  (`safeReturn()` n'accepte que des chemins internes). Les pages publiques restent en cache : tout ce qui dépend du
  membre y est chargé côté navigateur (bouton de l'en-tête `AccountButton`, menu mobile, `SaveButton` « Ajouter à ma
  liste » des pages vidéo / replay / article / événement, enregistrement de l'historique par `VideoPlayer` via la prop
  `history` → `recordWatch()` au premier démarrage réel de la lecture).
- **Administration** : collection « Membres du site » (section Administration du menu, administrateurs seuls),
  `MembersExport.tsx` au-dessus de la liste (nombre d'abonnés et export CSV), chiffres et « Les plus regardées par les
  membres (7 derniers jours) » sur le tableau de bord (voir ci-dessous).
- **Scripts** : `npm run seed` vide `member-history` et `member-favorites` avec les contenus, jamais `members` (comme
  `users`) ; `npm run reinit` efface aussi les membres (seuls les comptes de l'équipe sont remis). Le texte de la page
  Vie privée (`src/scripts/seed/pages.ts`) décrit l'espace membres : **`npm run maj-pages -- vie-privee`** l'applique sur
  une base existante.
- **Production** : les trois collections et `settings.members` font partie de la migration initiale
  (`src/migrations/20261021_172038_initiale.ts`).

## Administration (pensée pour une équipe non technique)

Composants dans `src/components/admin/`, déclarés dans `src/payload.config.ts` (`admin.components`) ou dans les collections ;
après l'ajout ou le renommage d'un composant : `npm run generate:importmap`. Styles : `src/app/(payload)/custom.scss`
(variables du thème Payload, thèmes clair et sombre).

- **Tableau de bord** (`Dashboard.tsx` + `dashboard-data.ts`, `admin.components.views.dashboard`) : actions courantes,
  état du site (chaque requête échoue sans bloquer la page ; une ligne dont la requête échoue affiche « Information
  indisponible », jamais un état rassurant par défaut), derniers contenus modifiés.
  Espace membres (rien tant qu'aucun compte n'existe) : ligne « Membres du site » réservée aux administrateurs (membres
  non suspendus, inscrits des 7 derniers jours, inscriptions fermées) et, pour toute
  l'équipe, « Les plus regardées par les membres (7 derniers jours) » : lignes de `member-history` dont `watchedAt` a
  moins de 7 jours (20 000 au plus, les plus récentes), comptées par contenu, soit le nombre de membres différents ;
  titres et liens par `loadItems(…, { publicOnly: false })`. La colonne de droite empile ses blocs (`.sw-dash__side`
  dans `custom.scss`).
- **Menu** : menu sur mesure, **dans l'ordre du menu du site** (`menu.ts`, rendu par `NavLinks.tsx` en `beforeNavLinks`) ;
  le menu automatique de Payload est vidé (`admin.group: false` sur toutes les collections et tous les globals, plugin
  `simpleDocuments`). Une nouvelle collection doit donc être ajoutée à `menu.ts`. La section « Administration » (membres
  du site, comptes, redirections) n'est affichée qu'aux administrateurs ; ces collections gardent `admin.hidden: hiddenForEditors`
  (l'API garde ses propres règles d'accès). Liens sans préchargement (`prefetch={false}`) : le préchargement de dizaines de
  vues de l'administration ralentissait la navigation.
- **Aperçu en direct** (`admin.livePreview`, config) : ouvert d'office sur les fiches à brouillons et sur « Accueil et
  direct » (aperçu de l'accueil) ; adresse calculée par `previewPath()` puis `previewUrl()` (`src/lib/preview.ts`, URL
  absolue d'après l'hôte de la requête, exigée par `postMessage`). Le bouton de l'aperçu est restylé avec un libellé
  (`#live-preview-toggler`, `custom.scss`).
  **Endroit modifié** : `PreviewFocus.tsx` (admin, avant les boutons de chaque fiche à brouillons) suit l'onglet ouvert et
  le champ touché, calcule page + cible avec `previewFocus()` (`src/lib/preview.ts`) et l'envoie à l'iframe
  (`postMessage` « swatter:preview-focus ») ; `PreviewClient` change de page si besoin et centre l'élément
  `[data-preview~=cible]` (sans `scrollIntoView`, qui ferait défiler l'administration). Cibles : `hero`, `flash`, `live`,
  `footer`, `ad`, `forecast`, `bulletin`, `webcam-<slug>`, `slot-<id>`. `settings` a `forceSelect: { _status: true }` : sans cela, Payload affiche
  « Brouillon » au lieu de « Modifications non publiées » sur un global qui a un brouillon.
  **Téléphone et tablette (≤ 1024 px)** : Payload passe l'aperçu en pleine largeur sans replier le formulaire, qui se
  retrouve écrasé ; `custom.scss` masque donc l'aperçu et son bouton à ces tailles, et `PreviewFocus` rend un lien
  « Aperçu » (`/apercu?chemin=…`, même page que l'aperçu, brouillon compris) qui l'ouvre dans un onglet. Le choix
  « aperçu ouvert » reste mémorisé tel quel pour l'ordinateur.
- **Page « Aide »** (`/admin/aide`, `HelpView.tsx`) : rend `GUIDE_CLIENT.md` (mini-rendu `markdown.tsx`, identifiants
  d'intertitres à la GitHub pour le sommaire). Le fichier est lu à l'exécution et embarqué dans le build autonome par
  `outputFileTracingIncludes` (`next.config.ts`) : **tenir le guide à jour à chaque changement d'écran**.
- **Formulaires** : `src/fields/date.ts` (dates `dd/MM/yyyy HH:mm`, heures sur 24 h). Pas de jeton dépendant de la langue
  (jour, mois en lettres) dans `displayFormat` : la traduction du sélecteur se charge après son premier rendu et
  afficherait « Sun ». Le jour de la semaine de la grille passe par une cellule Intl (`SlotTimeCell.tsx`).
  Traductions remplacées dans `i18n.translations.fr` (« Ajouter », « Enregistrer », « Choisir dans la médiathèque »…).
  Plugins locaux de la config : `seoSection` (bloc SEO replié, données inchangées dans `meta`) et `simpleDocuments`
  (onglet API masqué, bouton « Voir sur le site » pour les collections qui ont `admin.preview`).
- **Adresses uniques** (`src/fields/slug.ts`) : un titre déjà pris donne `titre-2`, `titre-3`… au lieu d'une erreur
  « valeur unique » ; l'adresse d'un contenu existant ne change pas quand on modifie son titre.
- **Couverture et aperçu automatiques** (`src/hooks/videoAutoMedia.ts`, hook `beforeValidate` de Videos et Replays ;
  validateur `thumbnailUnlessAutomatic`) et **ffmpeg** (`src/hooks/ffmpeg.ts`, module serveur : child_process, jamais dans
  `src/lib`).
  - Clé de la vidéo : `y<id YouTube>`, `m<n° du média>`, `u<sha1(url) sur 12 hex>`, `b<id Bunny>`. Fichiers créés :
    couvertures `youtube-<id>`, `video-<clé>`, `bunny-<id>` ; aperçus `apercu-<clé>.mp4`. Réutilisation par nom (like
    « base. » ou « base- », puis nom vérifié par expression régulière ; les doublons « -1 » sont acceptés).
  - Changement de clé par rapport à `originalDoc` : l'aperçu est refait ; la couverture n'est remplacée que si elle est
    vide ou si c'est un fichier automatique d'une autre clé (retirée en cas d'échec) ; une image choisie à la main n'est
    jamais touchée. Source non prise en charge : `preview` remis à null, couverture laissée. Rien n'est refait quand la
    clé ne change pas et que la couverture et l'aperçu sont déjà remplis (enregistrement automatique).
  - YouTube : la couverture n'a pas besoin de ffmpeg (maxresdefault, puis sddefault, puis hqdefault, `YOUTUBE_THUMB_BASE`).
    L'aperçu est un diaporama de maxres1-3, sinon sd1-3, sinon mq1-3 (recadrées en 16:9, zoom léger, fondus, 5 s).
  - Fichier envoyé : lu dans `MEDIA_DIR` s'il y est, sinon par son adresse (adresse du site → http://127.0.0.1:PORT, S3
    direct → telle quelle). Lien direct : http/https seulement (`-protocol_whitelist http,https,tcp,tls,crypto,httpproxy`,
    `-rw_timeout` 15 s). Bunny : variable facultative `BUNNY_CDN_HOST` (hôte de la zone de diffusion, par ex.
    vz-xxxx.b-cdn.net) → `https://<hôte>/<id>/thumbnail.jpg`, sans aperçu.
  - Sorties : couverture JPEG 16:9 de 540 à 1080 de haut (WebP après la Médiathèque) ; aperçu MP4 H.264 yuv420p, profil
    main, +faststart, sans son, 960×540, 30 im/s au plus, CRF 26, débit plafonné à 1,4 Mbit/s (≈ 875 Ko au pire) ; vidéos
    verticales ou carrées : bords rognés de 10 % au plus, puis fond flouté de la même image.
  - Robustesse : jamais d'erreur (avertissement dans le journal) ; pas de nouvel essai pendant 10 min après un échec (cache
    en mémoire par processus, `RETRY_AFTER_MS`) ; un seul traitement pour deux enregistrements simultanés ; délais de 30 s
    en local, 45 s à distance, 15 à 20 s pour ffprobe (SIGKILL) ; 2 ffmpeg à la fois au plus ; ffmpeg absent détecté une
    fois (`ffmpeg -version`) et signalé une fois ; `FFMPEG_PATH` et `FFPROBE_PATH` pour les tests ; `context.top10Reorder`
    respecté. Le hook tourne dans la transaction de l'enregistrement : une connexion à la base reste ouverte pendant ffmpeg.
  - ffmpeg : prérequis système en développement (`apt install ffmpeg`) ; installé dans les étapes Docker runner et tools
    (Debian 12 : ffmpeg 5.1). Sans lui, les tests qui en dépendent sont sautés et `test:complet` le signale.
  - Le replay d'exemple du jeu de démonstration (fichier envoyé, couverture choisie à la main) reçoit son aperçu pendant
    le seed.
- **Envois de fichiers** (`buildConfig.upload`) : 500 Mo par fichier, `useTempFiles` (dossier os.tmpdir()/swatter-envois) ;
  le fichier reçu va sur le disque puis est copié dans la médiathèque (S3 : flux depuis le fichier temporaire), jamais
  chargé en mémoire (vérifié avec un envoi réel de 284 Mo). `src/proxy.ts` ne doit jamais viser `/api`, sinon Next
  mettrait le corps en mémoire jusqu'à `proxyClientMaxBodySize` (10 Mo) et tronquerait les envois.
- **Grille des programmes** : `src/proxy.ts` (le « middleware » de Next 16) redirige `/admin/collections/schedule` sans
  filtre vers la semaine en cours, côté serveur (un filtre posé côté client entrait en concurrence avec la synchronisation
  d'adresse de Payload et chargeait toute la grille). `ScheduleTools.tsx` (au-dessus du tableau de la liste) filtre par
  jour et appelle `POST /api/schedule/copy-week` `{ from, days: 7 | 1, replace }` (`src/lib/schedule-copy.ts`) : recopie à
  la même heure de Paris sept jours plus tard, dans une transaction (tout ou rien), refus (409) si l'arrivée n'est pas vide
  sans `replace`. Semaines et journées TV de 2 h à 2 h (`src/lib/schedule-week.ts`, partagé client / serveur).
- **Top 10** (`src/hooks/top10.ts`) : places uniques, comme une liste qu'on réordonne. Une vidéo placée à une place
  prise décale le bloc de places occupées qui suit (au-delà de 10 : sortie du classement) ; une place libérée fait remonter
  le bloc suivant ; une place vide arrête le décalage. Les décalages passent `context.top10Reorder` (pas de cascade, pas de
  téléchargement YouTube). `getTop10()` affiche chaque vidéo à sa place exacte et complète les trous ; deux vidéos à la même
  place (ancienne donnée) : la plus récemment modifiée la garde.
- **Médiathèque** : description de l'image (`alt`) facultative, reprise du nom du fichier si elle est vide.
- **Chaîne YouTube** (global `youtube`, `src/lib/import/youtube.ts`) : l'adresse saisie (`@pseudo`, `/channel/UC…`, `/c/…`)
  est convertie en identifiant `UC…` (API si `YOUTUBE_API_KEY`, sinon lecture de la page de la chaîne, avec le cookie
  `SOCS` pour éviter la page de consentement européenne), mémorisé dans `channelId` tant que l'adresse ne change pas.
  Sans clé : flux RSS (15 dernières vidéos) ; avec clé : liste « Mises en ligne » (`UU…`) et durées. Synchronisation :
  chaque vidéo lue qui manque dans « Vidéos » / « Replays » (cases `inVideos` / `inReplays`) y est créée, qu'elle soit
  nouvelle ou non ; la présence se vérifie sur les dernières versions (`draft: true`), donc une fiche « retirée du site »
  n'est pas recréée, une fiche supprimée l'est. Couverture et aperçu par le hook `videoAutoMedia` (un seul fichier de
  chaque par vidéo, partagé par la vidéo et le replay). Tests : `YOUTUBE_BASE`, `YOUTUBE_API_BASE`, `YOUTUBE_THUMB_BASE` remplacent les
  adresses de YouTube. Ne garder que la chaîne : `npm run payload run src/scripts/videos-chaine-seulement.ts`
  (synchronise, puis supprime les vidéos et replays hors chaîne).
- **Direct sur Twitch** : option `twitch` du champ source (`videoSourceField(…, { twitch: true })`, direct seulement).
  `twitchTarget()` (`src/lib/video.ts`) accepte l'adresse de la chaîne, son nom seul, une vidéo (`/videos/123`) ou un lien
  de lecteur intégré ; le champ refuse le reste à la publication. Le lecteur Twitch exige le domaine de la page dans
  `parent` (ajouté côté navigateur, avec celui de `NEXT_PUBLIC_SITE_URL`) et un site en **HTTPS** : il ne s'affiche pas
  sur http://localhost (comportement de Twitch). Consentement « contenus externes » comme YouTube.
- **Lenteur en développement** : `npm run dev` compile chaque écran à la première visite (plusieurs secondes) et reste
  3 à 5 fois plus lent qu'en production. `scripts/dev.mjs` précharge les rubriques et l'administration au démarrage ; le
  cache de Turbopack (`.next/dev`) garde les compilations d'un démarrage à l'autre. Retour visuel immédiat au clic :
  dans l'administration, les liens sur mesure utilisent le `Link` de `@payloadcms/ui` (barre de progression de Payload)
  et le menu allume la rubrique cliquée aussitôt ; sur le site, `NavProgress` affiche une barre dorée si la page
  suivante tarde plus de 150 ms. Mesurer les temps de réponse avec `npm run build && npm start`
  (en production : 0,2 à 0,4 s par clic dans l'administration).
- Tests : `tests/e2e/admin.spec.ts` (brouillon invisible des visiteurs, aperçu, aperçu en direct, identifiants `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, par défaut ceux du poste de
  développement ; ignorés si la connexion échoue).

