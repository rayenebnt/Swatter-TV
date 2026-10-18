# Notes de développement — site Swatter TV

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
  lib/import/             imports automatiques (RSS, météo)
  styles/                 globals.css + un fichier par rubrique
  scripts/                scripts Payload (init-db, seed, import)
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
- **Images** : `<MediaImage media={doc.image} size="card" sizes="…" />` (next/image, AVIF/WebP). `priority` seulement pour l'image principale.
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
| `video/VideoPlayer({video, poster, title, autoPlay, live})`, `Top10Section`, `VideosSection`, `ReplaySection` | vidéos |
| `info/InfoSection` | info de l'accueil (contient `MeteoWidget variant="aside"`) |
| `programme/TvGridSection({variant: 'home' \| 'full', day?})` | grille TV (`day` = AAAA-MM-JJ, page /programme-tv) |
| `agenda/AgendaSection`, `webcams/WebcamsSection({limit})` | agenda, webcams |
| `lib/import/rss.ts → importRss(payload)`, `lib/import/meteo.ts → importMeteo(payload)` | imports (appelés par `GET /api/cron/import`) |
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
| `seed/assets/*.jpg` | vignettes réelles du site actuel, pour le jeu de données de démonstration |
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
| `/info`, `/info/[departement]`, `/info/[departement]/[slug]` | l'info, par département, article |
| `/info/rss.xml` | flux RSS sortant (articles de la rédaction) |
| `/meteo` | la météo |
| `/agenda`, `/agenda/[slug]` | agenda, événement |
| `/programme-tv` | programme TV |
| `/replay`, `/replay/[slug]` | replay, émission rediffusée |
| `/videos`, `/videos/[slug]` | vidéos, vidéo |
| `/webcams` | webcams |
| `/recherche?q=` | résultats de recherche |
| `/[...slug]` | pages éditoriales (canaux de réception, le groupe, crédits, vie privée, mentions légales) et redirections des anciennes adresses |
| `/admin`, `/api` | administration et API Payload |

## Commandes

```bash
npm run dev            # développement (http://localhost:3000, admin sur /admin)
npm run build          # build de production
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run payload run src/scripts/init-db.ts   # tables + premier administrateur
npm run seed           # données de démonstration
```

## Notes d'intégration (mises à jour en cours de développement)

- **Images** : `mediaUrl()` renvoie un **chemin local** (`/api/media/file/…`) pour que next/image optimise les fichiers
  (AVIF/WebP, srcset). Pour une URL absolue (JSON-LD, flux) : `absoluteUrl(mediaUrl(doc.image, 'card'))`
  (`absoluteUrl` laisse intactes les URL déjà absolues). `mediaFocal()` ne renvoie rien pour le centre par défaut (50 % 50 %) :
  le cadrage CSS de chaque rubrique (`object-position`) s'applique tant qu'aucun point focal n'a été choisi.
- **Tuile météo du bento « À la une »** (`components/meteo/MiniMeteo`) : le composant rend **la tuile entière** comme racine,
  `<article className="tile b-meteo" data-reveal style={{ '--d': 3 } as CSSProperties}>`, avec à l'intérieur la structure
  de la maquette (`.mini-meteo` > titre, `.mini-meteo__row` > `svg.wi` + `.mini-meteo__t`, libellé, min/max) et un lien
  étiré vers `/meteo` (`<Link className="stretched" href="/meteo">` sur le titre). Il renvoie `null` sans prévision : la grille
  du bento détecte la tuile avec `:has(.b-meteo)`. `src/styles/une.css` fournit déjà le placement et le fond de `.b-meteo` et les
  styles de base `.mini-meteo` ; compléter dans `meteo.css` si besoin.
- **Classes `.tile` / `.bigplay`** : définies dans `src/styles/une.css`, chargé uniquement sur l'accueil. Ailleurs, utiliser les
  cartes `.card` de globals.css (ou importer `@/styles/une.css` explicitement).
- **Consentement** (contenus externes YouTube / Bunny / iframes) : `useConsent()`, `openCookieSettings()`, `onConsentChange()`
  de `@/components/layout/consent` (composants client uniquement).
- **JSX serveur passé en prop à un composant client** et rendu à côté d'autres enfants : lui donner une `key`
  (sinon avertissement React en développement).
- **`.sr-only` dans un rail à défilement horizontal** : mettre `position: relative` sur la carte, sinon l'élément masqué
  échappe au rognage et élargit la page.
- **Import météo** : `importMeteo()` renvoie `{ ok: false, skipped: true }` quand la mise à jour automatique est désactivée
  (ce n'est pas une erreur). En production, lancer `npm run import` une fois puis brancher la tâche planifiée `GET /api/cron/import`.
- **Ne jamais faire varier le `className` d'un élément `[data-reveal]`** dans un composant client : React réécrit `class`
  et efface `is-in`, l'élément redevient invisible. Utiliser un attribut `data-*` ou un élément enfant.
- **Open Graph** : une page qui définit `openGraph` sans `images` perd l'image par défaut (`opengraph-image` du groupe
  `(frontend)`, dont l'adresse est suffixée) : reprendre `images: (await parent).openGraph?.images ?? []` ou fournir une image.
- **Redirections** : les anciennes adresses sont dans `next.config.ts` (`redirects()`) ; les variantes qui ne diffèrent que par
  la casse ou les accents passent par `[...slug]` (la correspondance de `next.config.ts` est insensible à la casse et bouclerait).
- **Recherche** : `ILIKE` sans index, suffisant à cette échelle ; pour de gros volumes, ajouter un index trigramme (pg_trgm).
  `SearchHit.image` peut être une URL distante (articles RSS) : l'afficher avec `unoptimized`.
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

## Administration (pensée pour une équipe non technique)

Composants dans `src/components/admin/`, déclarés dans `src/payload.config.ts` (`admin.components`) ou dans les collections ;
après l'ajout ou le renommage d'un composant : `npm run generate:importmap`. Styles : `src/app/(payload)/custom.scss`
(variables du thème Payload, thèmes clair et sombre).

- **Tableau de bord** (`Dashboard.tsx` + `dashboard-data.ts`, `admin.components.views.dashboard`) : actions courantes,
  état du site (chaque requête échoue sans bloquer la page), derniers contenus modifiés (hors articles importés).
- **Menu** : groupes Publier / Programme TV / Le site / Administration (ordre = ordre des collections dans la config,
  les globals à la fin de leur groupe). Comptes, flux RSS et redirections : `admin.hidden: hiddenForEditors`
  (masqués aux éditeurs, l'API garde ses propres règles d'accès). `NavLinks.tsx` : « Tableau de bord », « Voir le site », « Aide ».
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
- **Vignette YouTube** (`src/hooks/youtubeThumbnail.ts`) : vidéo ou replay YouTube enregistré sans image → téléchargement
  de `maxresdefault`, puis `sddefault`, `hqdefault` dans la médiathèque (`youtube-<id>`), réutilisé s'il existe déjà.
  En cas d'échec, enregistrement sans image (visuel de repli sur le site) et avertissement dans le journal. Pour tester sans
  accès à YouTube : `YOUTUBE_THUMB_BASE=http://127.0.0.1:8765/vi` (servir `vi/<id>/maxresdefault.jpg`).
- **Grille des programmes** : `ScheduleTools.tsx` (au-dessus du tableau de la liste) ouvre la semaine en cours, filtre par
  jour et appelle `POST /api/schedule/copy-week` `{ from, days: 7 | 1, replace }` (`src/lib/schedule-copy.ts`) : recopie à
  la même heure de Paris sept jours plus tard, dans une transaction (tout ou rien), refus (409) si l'arrivée n'est pas vide
  sans `replace`. Semaines et journées TV de 2 h à 2 h (`src/lib/schedule-week.ts`, partagé client / serveur).
- **Top 10** (`src/hooks/top10.ts`) : places uniques, comme une liste qu'on réordonne. Une vidéo placée à une place
  prise décale le bloc de places occupées qui suit (au-delà de 10 : sortie du classement) ; une place libérée fait remonter
  le bloc suivant ; une place vide arrête le décalage. Les décalages passent `context.top10Reorder` (pas de cascade, pas de
  téléchargement YouTube). `getTop10()` affiche chaque vidéo à sa place exacte et complète les trous ; deux vidéos à la même
  place (ancienne donnée) : la plus récemment modifiée la garde.
- **Médiathèque** : description de l'image (`alt`) facultative, reprise du nom du fichier si elle est vide.
- Tests : `tests/e2e/admin.spec.ts` (identifiants `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, par défaut ceux du poste de
  développement ; ignorés si la connexion échoue).

