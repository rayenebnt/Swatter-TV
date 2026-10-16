# Prompt — Refonte du site Swatter TV

> **Mode d'emploi :** une fois la maquette (`maquette/index.html`) validée par le client, donne ce fichier à Claude Code : « Lis `PROMPT_REFONTE.md` et commence l'étape 1. »

---

## 1. Rôle et contexte

Tu es un développeur full-stack senior et un designer UI spécialisé dans les sites de chaînes TV et de médias d'information. Tu travailles dans ce dépôt.

**Client :** Swatter TV & Info (https://www.swatter-tv.fr/), web TV locale basée à Thyez (Haute-Savoie), qui couvre la Haute-Savoie et l'Auvergne-Rhône-Alpes : direct, info régionale, météo, agenda des sorties, programme TV, replay et webcams.

**Mission :** **refonte complète du design** sur une base technique moderne. **Aucune nouvelle fonctionnalité** : tu reproduis le périmètre actuel avec une interface du niveau de **TF1+ / TF1 Info** et **M6+**, des performances excellentes et un référencement solide. Le site doit s'héberger simplement, sans dépendre d'un seul fournisseur.

**Référence visuelle obligatoire :** la maquette validée `maquette/index.html`. Reprends fidèlement ses tokens (couleurs, typographies, rayons), ses composants et sa mise en page.

---

## 2. Périmètre fonctionnel (identique au site actuel)

Pages et rubriques existantes, à reproduire :

| Rubrique | Contenu actuel |
|---|---|
| **Accueil** | Vidéo du jour, Sortie du week-end, L'info du jour, « Vidéos du jour » par catégories (Divertissement, Séries-réalité, Séries, Cinéma), bloc Webcams, derniers replays, réseaux sociaux, contact |
| **Le Direct** | Lecteur du flux en direct |
| **L'Info** | Flux d'actualité 7j/7, 24h/24 par commune et département d'Auvergne-Rhône-Alpes (flux RSS), pagination « Suivant », état « Pas d'actualité pour aujourd'hui » |
| **La Météo** | Région Auvergne-Rhône-Alpes, onglets par jour, matin / après-midi / soirée, bulletin texte |
| **Agenda** | Offre culturelle, touristique et sportive en Haute-Savoie, « Programme de la journée » |
| **Programme TV** | Grille par jour (onglets jour par jour), vignettes des programmes |
| **Le Replay** | Liste paginée des replays |
| **Webcams** | Flux en direct (ex. Lac du Bourget – Port d'Aix-les-Bains, Lac Léman – Eaux-Vives Genève) |
| **Compte** | « Se connecter » |
| **Recherche** | « Programme, vidéo, film, acteur… » |
| **Publicité** | Emplacements bannières (partenaires) |
| **Pied de page** | Contact (36 rue de la Chaumière, 74300 Thyez, contact@swatter-tv.fr, téléphone uniquement par mail), Vie privée, Canaux de réception, Le groupe, Crédits, réseaux sociaux (Facebook, Instagram, YouTube, TikTok), mention « captures et téléchargements détectés automatiquement » |
| **Divers** | Note 4,5 ★ et compteur (995 349) affichés près du logo, bandeau cookies |

À confirmer avec le client avant l'étape 4 :

- Source du flux direct et hébergeur des vidéos actuels : ____
- Source des flux RSS de l'info et des données météo : ____
- Fonctionnement actuel de « Se connecter » (qui se connecte, pour quoi faire) : ____
- Fournisseur des webcams (ex. Windy, Skaping, ViewSurf) : ____
- Régie publicitaire / format des bannières : ____
- Signification exacte du compteur « 995 349 » : ____

Ne construis rien hors de ce périmètre. En cas de doute, pose-moi la question au lieu de deviner.

---

## 3. Stack technique imposée

| Besoin | Choix |
|---|---|
| Framework | **Next.js** (dernière version stable, App Router), **TypeScript strict**, React Server Components |
| UI | **Tailwind CSS** avec les tokens de la maquette, composants maison. Animations limitées à l'essentiel |
| Base de données | **PostgreSQL** |
| Back-office / CMS | **Payload CMS 3**, intégré à l'application Next.js : la rédaction gère vidéos, articles, programme TV, agenda, mises en avant de l'accueil et pubs sans toucher au code |
| Vidéo et direct | **Jamais stockée ni servie par le serveur web.** Bunny Stream (ou Mux) pour le replay (HLS adaptatif, vignettes auto) ; flux direct HLS depuis le fournisseur actuel ou Bunny / Mux Live |
| Lecteur | Vidstack Player (HLS, direct et replay, plein écran, AirPlay / Chromecast natifs du navigateur) |
| Imports automatiques | Tâches planifiées (cron) : import des flux RSS de l'info, de la météo et de l'agenda vers la base, avec cache |
| Médias (images) | Stockage compatible S3 (Bunny Storage, Cloudflare R2 ou Scaleway) via l'adaptateur S3 de Payload |
| Validation | Zod |
| Tests | Playwright sur les parcours critiques (accueil → direct ; accueil → article ; programme TV → replay) |
| Déploiement | `Dockerfile` multi-stage et `docker-compose.yml` (app + Postgres) pour n'importe quel VPS (OVH, Scaleway, Hetzner) via Coolify, **et** compatible Vercel + Neon. Hébergement des données dans l'UE (RGPD) |

---

## 4. Direction artistique (déjà validée dans la maquette)

- **Couleur principale : Bleu Nuit Alpin** (fond `#071224`, surfaces `#0D1D38` / `#132A50`).
- **Couleur secondaire : Or Swatter** (`#D9AA45`, dégradé `#F8E2A0 → #E4B64C → #B5832A`), réservée aux actions, aux accents et aux éléments mis en avant.
- **Rouge `#E8383D`** uniquement pour le direct (« En direct », « Live »).
- **Typographies :** Outfit (titres, navigation) et Inter (texte), auto-hébergées.
- **Composants de la maquette à reprendre :** header fixe transparent puis opaque au scroll, hero « Le Direct » plein écran avec progression du programme et panneau « À suivre », bandeau « Flash info » défilant, cartes à la une, rails horizontaux avec filtres, flux Info avec filtres par département, widget météo à onglets, programme TV avec programme « En cours », agenda avec pastilles de date, webcams en direct, replay, bloc réseaux sociaux, footer, barre de navigation basse sur mobile, recherche plein écran, bandeau cookies conforme CNIL.
- **Responsive :** mobile-first, impeccable de 360 px jusqu'aux écrans TV (≥ 1920 px).
- **Accessibilité** WCAG 2.2 AA / RGAA : contrastes, focus visibles, navigation au clavier dans les rails et les onglets, `alt` sur toutes les images, `prefers-reduced-motion` respecté.
- Le logo de la maquette est une reconstitution : remplace-le par le fichier vectoriel officiel fourni par le client (`/brand`).

---

## 5. Performance (objectif : « ça ne rame pas »)

- **Core Web Vitals sur mobile** : LCP < 2,0 s, INP < 200 ms, CLS < 0,05.
- **Lighthouse ≥ 95** en Performance, Accessibilité, Bonnes pratiques et SEO.
- Pages en **rendu statique / ISR** avec revalidation à la demande : un hook Payload `afterChange` appelle `revalidateTag`, et les imports RSS / météo revalident leurs pages.
- Server Components par défaut. `"use client"` réservé au lecteur, aux rails, aux onglets, aux menus et à la recherche.
- **Budget JS** : moins de 150 ko gzip sur la page d'accueil (hors lecteur).
- Lecteur vidéo, webcams et scripts publicitaires chargés à la demande (`dynamic import`, `IntersectionObserver`).
- `next/image` : AVIF/WebP, tailles responsives, image du hero en `priority`, le reste en lazy-load. Emplacements pub à taille réservée (zéro CLS).
- CDN (Cloudflare ou Bunny CDN) devant le site, en-têtes `Cache-Control` adaptés.
- Index PostgreSQL sur les champs filtrés et triés (`slug`, département, date de publication, jour de diffusion).

---

## 6. SEO

- **URLs propres et stables** : `/direct`, `/info/[departement]/[slug]`, `/meteo`, `/agenda/[slug]`, `/programme-tv/[date]`, `/replay/[slug]`, `/webcams/[slug]`.
- **Redirections 301** de toutes les anciennes URLs (`/Accueil`, `/Le-Direct`, `/L-info`, `/La-Meteo`, `/Agenda`, `/Programme-TV`, `/Le-Replay`…) vers les nouvelles, gérables depuis le back-office (plugin Payload Redirects). Script de crawl de l'ancien site et/ou import d'un export Google Search Console. **Aucune URL indexée ne doit tomber en 404.**
- Metadata API de Next.js : `title`, `description`, `canonical`, Open Graph et Twitter Card, éditables pour chaque contenu (plugin Payload SEO).
- **Données structurées JSON-LD** : `Organization` / `TelevisionStation` (adresse de Thyez), `WebSite` + `SearchAction`, `BreadcrumbList`, `NewsArticle` pour l'info, `VideoObject` pour les vidéos et replays, `VideoObject` + `BroadcastEvent` (`isLiveBroadcast`) pour le direct, `Event` pour l'agenda, `TVEpisode` / `TVSeries` si pertinent.
- `sitemap.xml` dynamique avec **sitemap vidéo** et **sitemap Google News** pour les articles de moins de 48 h, `robots.txt`, page 404 utile.
- Pages département (`/info/haute-savoie`…) et pages commune riches en contenu pour le référencement local.
- HTML sémantique, un seul `h1` par page, fil d'Ariane visible, maillage interne entre info, replay, agenda et programme.

---

## 7. Modèle de données (collections Payload)

- `videos` : titre, slug, catégorie (Divertissement, Séries-réalité, Séries, Cinéma…), description, vignette, identifiant vidéo, durée, date, « vidéo du jour », champs SEO.
- `replays` : programme, épisode, date de diffusion, identifiant vidéo, durée, vignette.
- `programs` et `schedule` : programmes et grille de diffusion (date, heure de début, durée, programme lié).
- `articles` : info (titre, slug, chapô, contenu, image, commune, département, source RSS, date), « info du jour ».
- `events` : agenda (titre, dates, lieu, commune, catégorie, affiche, programme de la journée), « sortie du week-end ».
- `weather` : prévisions par jour et par ville (matin / après-midi / soirée, bulletin).
- `webcams` : nom, lieu, URL du flux, vignette, ordre.
- `ads` : emplacements publicitaires (format, image, lien, dates de diffusion).
- `pages` (pages libres et légales), `media`, `users`, `admins`, `redirects`.
- Global `settings` : logo, réseaux sociaux, footer, contenus du hero, bandeau Flash info, note et compteur.
- **Seed** de démonstration réaliste et **scripts de migration** des contenus existants (idempotents, relançables).

---

## 8. Sécurité et RGPD

- Toutes les variables d'environnement documentées dans `.env.example`. Aucun secret commité.
- Bandeau cookies conforme CNIL (refuser aussi simple qu'accepter). Analytics sans cookie par défaut (Plausible ou Matomo). Scripts publicitaires chargés seulement après consentement.
- Rate limiting sur la connexion et la recherche. Validation Zod de toutes les entrées.
- En-têtes de sécurité : CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`.
- Reprise des textes légaux actuels (vie privée, crédits, mentions).

---

## 9. Livrables

1. Le code dans ce dépôt, avec des commits atomiques et des messages clairs.
2. `README.md` : installation locale, variables d'environnement, déploiement sur VPS (Docker / Coolify) et sur Vercel, sauvegardes automatiques de PostgreSQL.
3. Les scripts de migration (contenus, vidéos, redirections).
4. `GUIDE_CLIENT.md` : guide court du back-office (publier une vidéo, un article, un événement, mettre à jour le programme TV, gérer la page d'accueil et les pubs).
5. Un rapport Lighthouse final (mobile et desktop) sur l'accueil, un article, le direct et le programme TV.

---

## 10. Méthode de travail

Procède par étapes. **Arrête-toi à la fin de chaque étape** pour que je valide avant de continuer :

1. **Initialisation** : projet Next.js + Payload, design system repris de la maquette, header / footer / navigation.
2. **Données** : collections Payload, back-office, seed.
3. **Pages** : accueil, direct, info (liste, département, article), météo, agenda, programme TV, replay, webcams, recherche.
4. **Intégrations** : flux direct, vidéos, imports RSS / météo / agenda, connexion, publicités.
5. **Qualité** : SEO, redirections, performance, accessibilité, tests Playwright.
6. **Mise en production** : Docker, déploiement, migration des contenus, documentation.

À chaque étape : lance le lint, le typecheck et les tests, et donne-moi un récapitulatif court de ce qui est fait et de ce qui reste.
