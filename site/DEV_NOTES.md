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
  lib/import/             imports automatiques (météo, chaîne YouTube)
  lib/members/            espace membres : API, sessions, mots de passe, e-mails, limites (voir « Espace membres »)
  components/members/     espace membres côté site (formulaires, Mon espace, « Ajouter à ma liste », historique)
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
  (les sessions Payload d'un même compte s'écrasent). Accessibilité : `@axe-core/playwright`.
- **Variables lues par le site pour les tests** : `MEDIA_DIR` (dossier des médias, `media/` par défaut), `NEXT_DIST_DIR`
  (dossier de construction, `.next` par défaut ; un autre dossier utilise `tsconfig.next-test.json`, pour que la
  construction ne réécrive pas `tsconfig.json`), `MEMBER_RATE_FACTOR`, `OPEN_METEO_URL`, `YOUTUBE_BASE`,
  `YOUTUBE_THUMB_BASE`.
- **Versions** : Vitest 4 et Vite 7 (`overrides` de `package.json`) : Vitest 5 et Vite 8 font échouer `npm install`
  (« Cannot read properties of null (reading 'edgesOut') »).

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
  Villes suivies : `METEO_CITIES` (`src/lib/meteo.ts`), une par département (`department`), la première (Annecy) étant la
  ville principale ; chaque jour garde le détail de la ville principale et, dans `views`, celui des autres villes (pages
  `/meteo/[departement]`, `getMeteo(dept)` dans `src/components/meteo/data.ts`) ;
  une prévision enregistrée n'affiche que ces villes (les autres sont ignorées jusqu'au prochain import).
- **Ne jamais faire varier le `className` d'un élément `[data-reveal]`** dans un composant client : React réécrit `class`
  et efface `is-in`, l'élément redevient invisible. Utiliser un attribut `data-*` ou un élément enfant.
- **Open Graph** : une page qui définit `openGraph` sans `images` perd l'image par défaut (`opengraph-image` du groupe
  `(frontend)`, dont l'adresse est suffixée) : reprendre `images: (await parent).openGraph?.images ?? []` ou fournir une image.
- **Redirections** : les anciennes adresses sont dans `next.config.ts` (`redirects()`) ; les variantes qui ne diffèrent que par
  la casse ou les accents passent par `[...slug]` (la correspondance de `next.config.ts` est insensible à la casse et bouclerait).
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
- **Production** : migration à créer pour les trois collections et `settings.members` (voir README).

## Administration (pensée pour une équipe non technique)

Composants dans `src/components/admin/`, déclarés dans `src/payload.config.ts` (`admin.components`) ou dans les collections ;
après l'ajout ou le renommage d'un composant : `npm run generate:importmap`. Styles : `src/app/(payload)/custom.scss`
(variables du thème Payload, thèmes clair et sombre).

- **Tableau de bord** (`Dashboard.tsx` + `dashboard-data.ts`, `admin.components.views.dashboard`) : actions courantes,
  état du site (chaque requête échoue sans bloquer la page), derniers contenus modifiés (hors articles importés).
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
  n'est pas recréée, une fiche supprimée l'est. Vignette par le hook `youtubeThumbnail` (une seule image par vidéo,
  partagée par la vidéo et le replay). Tests : `YOUTUBE_BASE`, `YOUTUBE_API_BASE`, `YOUTUBE_THUMB_BASE` remplacent les
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

