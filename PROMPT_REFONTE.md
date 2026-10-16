# Prompt — Refonte du site Swatter TV

> **Mode d'emploi :** complète la section « Périmètre fonctionnel » (cases à cocher et champs `____`), ajoute le logo et les couleurs de la marque dans `/brand`, puis donne ce fichier à Claude Code : « Lis `PROMPT_REFONTE.md` et commence l'étape 1. »

---

## 1. Rôle et contexte

Tu es un développeur full-stack senior et un designer UI spécialisé dans les plateformes de streaming. Tu travailles dans ce dépôt.

**Client :** Swatter TV (https://www.swatter-tv.fr/), une plateforme SVOD 100 % montagne (« Swatter TV & Info Plus ») : abonnement sans engagement, des centaines de programmes (documentaires, films, séries, sports outdoor…), disponibles sur tous les écrans.

**Mission :** **refonte complète du design** sur une base technique moderne. **Aucune nouvelle fonctionnalité** : tu reproduis le périmètre fonctionnel actuel, avec une interface du niveau de **TF1+** et **M6+**, des performances excellentes et un référencement solide. Le site doit pouvoir être hébergé simplement, sans dépendre d'un seul fournisseur.

---

## 2. Périmètre fonctionnel (à reproduire à l'identique)

> À valider avant de commencer. Ne construis **que** ce qui est coché. En cas de doute, pose-moi la question au lieu de deviner.

- [ ] Page d'accueil éditorialisée
- [ ] Catalogue et pages catégories (filtres existants : ____)
- [ ] Fiche programme (synopsis, bande-annonce, saisons / épisodes)
- [ ] Lecteur vidéo
- [ ] Recherche
- [ ] Inscription / connexion / mot de passe oublié
- [ ] Abonnement et paiement en ligne (prestataire actuel : ____)
- [ ] Période d'essai gratuite (durée : ____)
- [ ] Espace « Mon compte » (abonnement, factures, résiliation)
- [ ] « Continuer à regarder » / reprise de lecture
- [ ] Ma liste / favoris
- [ ] Direct (live)
- [ ] Rubrique Info Plus (actualités / articles)
- [ ] FAQ, contact, pages légales (mentions, CGU/CGV, confidentialité)

Informations sur l'existant :

- Plateforme / CMS actuel : ____
- Hébergeur vidéo actuel : ____
- Nombre de programmes / d'heures de vidéo : ____
- Nombre d'abonnés actifs : ____
- Couleurs de la marque : ____ (logo dans `/brand`)
- Langues : français ____ (autres : ____)

---

## 3. Stack technique imposée

| Besoin | Choix |
|---|---|
| Framework | **Next.js** (dernière version stable, App Router), **TypeScript strict**, React Server Components |
| UI | **Tailwind CSS** et composants maison (shadcn/ui comme base). Animations limitées à l'essentiel (CSS d'abord, Motion si nécessaire) |
| Base de données | **PostgreSQL** |
| Back-office / CMS | **Payload CMS 3**, intégré à l'application Next.js : le client gère programmes, catégories, rangées de l'accueil et pages sans toucher au code |
| Authentification | Payload Auth, avec une collection `users` (abonnés) séparée de la collection `admins` |
| Vidéo | **Jamais stockée ni servie par le serveur web.** Bunny Stream (ou Mux) : streaming HLS adaptatif, vignettes générées automatiquement, **URLs signées à durée limitée** pour les contenus payants |
| Lecteur | Vidstack Player (HLS, sous-titres, reprise, plein écran, AirPlay et Chromecast natifs du navigateur) |
| Paiement | **Stripe Billing** (Checkout, portail client, webhooks), uniquement si le paiement existe déjà ; sinon on garde le prestataire actuel |
| Médias (images) | Stockage compatible S3 (Bunny Storage, Cloudflare R2 ou Scaleway) via l'adaptateur S3 de Payload |
| Validation | Zod |
| Tests | Playwright sur les parcours critiques (accueil → fiche → lecture ; inscription → paiement) |
| Déploiement | `Dockerfile` multi-stage et `docker-compose.yml` (app + Postgres) pour n'importe quel VPS (OVH, Scaleway, Hetzner) via Coolify, **et** compatible Vercel + Neon. Hébergement des données dans l'UE (RGPD) |

---

## 4. Direction artistique (références : TF1+ et M6+)

**Principes :** les visuels des programmes passent avant tout. L'interface s'efface, le contenu prend toute la place. Moderne, cinématographique, avec une identité « montagne » apportée par la photo et une touche de couleur, pas par la décoration.

- **Thème sombre par défaut** (fond presque noir légèrement bleuté) et texte blanc cassé. La couleur d'accent est celle de la marque Swatter. Si elle ne fonctionne pas sur fond sombre, propose une variante accessible.
- **Header** fixe, transparent sur le hero puis opaque au scroll : logo, navigation (Accueil, Programmes, Catégories, Info Plus et Direct si cochés), recherche, compte. **Sur mobile, barre de navigation en bas.**
- **Hero plein écran** : carrousel de 3 à 6 programmes mis en avant depuis le back-office. Visuel ou bande-annonce muette en lecture automatique, désactivée si `prefers-reduced-motion` ou si la connexion est lente. Titre (logo-titre si disponible), accroche, boutons « Regarder » et « Plus d'infos ».
- **Rangées horizontales (rails)** défilables au doigt, à la souris et au clavier, avec des flèches au survol sur desktop : « Nouveautés », « Top 10 » (gros chiffres, façon TF1+), une rangée par catégorie, rangées éditoriales créées dans le back-office.
- **Cartes programme** aux formats 16:9 et affiche 2:3. Au survol sur desktop : léger zoom, durée, catégorie et badges (« Nouveau », « Exclusif »). Barre de progression seulement si la reprise de lecture existe.
- **Fiche programme** : grand visuel en fond avec un dégradé, métadonnées (année, durée, catégorie, classification, massif / lieu), synopsis, CTA, onglets Saisons / Épisodes, rangée « Vous aimerez aussi » (même catégorie).
- **Pages catégorie** : en-tête visuel, filtres existants, grille responsive.
- **Paywall élégant** : la fiche et la bande-annonce restent visibles pour tous. Pour un non-abonné, le bouton lecture ouvre l'offre d'abonnement dans une modale ou une page dédiée.
- **Typographie** : une sans-serif moderne auto-hébergée via `next/font` (par ex. Manrope, Plus Jakarta Sans ou Inter), avec des titres gras et serrés.
- **Chargements** : squelettes (skeletons), aucun saut de mise en page, micro-interactions sobres.
- **Responsive** : mobile-first, impeccable de 360 px jusqu'aux écrans TV (≥ 1920 px, navigation possible à la télécommande / au clavier).
- **Accessibilité** WCAG 2.2 AA / RGAA : contrastes, focus visibles, navigation au clavier dans les rails, `alt` sur toutes les images, sous-titres lorsqu'ils sont disponibles.

**Avant de coder les pages**, crée le design system (tokens de couleurs, typographie, espacements, rayons, ombres) et les composants `Button`, `Badge`, `ProgramCard`, `Rail`, `Hero`, `Modal`, `Header`, `Footer`. Montre-moi ensuite une **page d'accueil statique avec des données fictives** pour validation.

---

## 5. Performance (objectif : « ça ne rame pas »)

- **Core Web Vitals sur mobile** : LCP < 2,0 s, INP < 200 ms, CLS < 0,05.
- **Lighthouse ≥ 95** en Performance, Accessibilité, Bonnes pratiques et SEO.
- Pages publiques en **rendu statique / ISR** avec revalidation à la demande : un hook Payload `afterChange` appelle `revalidateTag` / `revalidatePath`, pour que les mises à jour soient visibles immédiatement sans reconstruire le site.
- Server Components par défaut. `"use client"` réservé au lecteur, aux carrousels, aux menus et aux formulaires.
- **Budget JS** : moins de 150 ko gzip sur la page d'accueil (hors lecteur).
- Lecteur vidéo et scripts tiers chargés à la demande (`dynamic import`).
- `next/image` : AVIF/WebP, tailles responsives, image du hero en `priority`, le reste en lazy-load, placeholder flou.
- Polices auto-hébergées, sous-ensemble latin, `display: swap`.
- CDN (Cloudflare ou Bunny CDN) devant le site, en-têtes `Cache-Control` adaptés à chaque type de ressource.
- Index PostgreSQL sur les champs filtrés et triés (`slug`, catégorie, date de publication, mise en avant). Pas de requêtes N+1 (utilise `depth` et `select` de Payload).

---

## 6. SEO

- **URLs propres et stables** : `/programmes/[slug]`, `/programmes/[slug]/saison-[n]/[episode]`, `/categories/[slug]`, `/info-plus/[slug]`.
- **Redirections 301** de toutes les anciennes URLs vers les nouvelles (plugin Payload Redirects, gérable depuis le back-office). Fournis un script qui crawle l'ancien site (et/ou lit un export de la Google Search Console) pour générer la table de correspondance. **Aucune URL indexée ne doit tomber en 404 après la mise en ligne.**
- Metadata API de Next.js : `title`, `description`, `canonical`, Open Graph et Twitter Card, éditables pour chaque contenu dans le back-office (plugin Payload SEO), avec des valeurs par défaut générées automatiquement.
- **Données structurées JSON-LD** : `Organization`, `WebSite` + `SearchAction`, `BreadcrumbList`, `Movie` / `TVSeries` / `TVSeason` / `TVEpisode` et `VideoObject` (`thumbnailUrl`, `uploadDate`, `duration`, `description`). Pour les contenus réservés aux abonnés, ajoute `isAccessibleForFree: false` avec `hasPart` afin d'éviter tout soupçon de cloaking.
- `sitemap.xml` dynamique (pages, programmes, épisodes, articles) avec **sitemap vidéo**, `robots.txt`, page 404 utile (recherche et suggestions).
- **Fiches programmes publiques et riches en texte** (synopsis long, intervenants, lieux, massif, discipline) pour se positionner sur la longue traîne (ex. « documentaire alpinisme Mont-Blanc », « film ski freeride »).
- HTML sémantique, un seul `h1` par page, fil d'Ariane visible, liens internes entre programmes, catégories et articles.
- Balises `hreflang` si le site est multilingue.

---

## 7. Modèle de données (collections Payload)

- `programs` : titre, slug, type (film / série / documentaire), synopsis court et long, visuels (16:9, affiche 2:3, logo-titre), bande-annonce, catégories, tags, année, durée, classification, lieux / massif, intervenants, mise en avant, date de publication, statut (brouillon / publié), champs SEO.
- `seasons` et `episodes` : relation au programme, numéro, titre, synopsis, durée, identifiant vidéo (Bunny / Mux), gratuit ou réservé aux abonnés.
- `categories` : nom, slug, visuel, ordre.
- `rails` : rangées éditoriales de l'accueil (titre, type automatique ou sélection manuelle, ordre), réorganisables par glisser-déposer.
- `news` (Info Plus, si cochée), `pages` (pages libres et légales), `media`, `users` (abonnés), `admins`, `redirects`.
- Global `settings` : logo, liens des réseaux sociaux, footer, programmes du hero, textes de l'offre d'abonnement.
- **Seed** : données de démonstration réalistes sur le thème de la montagne pour développer et tester.
- **Script de migration** des contenus existants (import CSV / JSON → Payload), idempotent et relançable.

---

## 8. Sécurité et RGPD

- Toutes les variables d'environnement documentées dans `.env.example`. Aucun secret commité.
- Bandeau cookies conforme CNIL (refuser aussi simple qu'accepter). Analytics sans cookie par défaut (Plausible ou Matomo).
- Rate limiting sur la connexion, l'inscription et la réinitialisation du mot de passe. Validation Zod de toutes les entrées.
- En-têtes de sécurité : CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`.
- Vidéos payantes uniquement via des URLs signées à durée limitée. Webhooks Stripe vérifiés par signature.
- Reprise des textes légaux actuels (mentions légales, CGU/CGV, confidentialité).

---

## 9. Livrables

1. Le code dans ce dépôt, avec des commits atomiques et des messages clairs.
2. `README.md` : installation locale, variables d'environnement, déploiement sur VPS (Docker / Coolify) et sur Vercel, sauvegardes automatiques de PostgreSQL.
3. Les scripts de migration (contenus, vidéos, redirections).
4. `GUIDE_CLIENT.md` : guide court et illustré du back-office (ajouter un programme, gérer la page d'accueil, publier un article).
5. Un rapport Lighthouse final (mobile et desktop) sur l'accueil, une fiche programme et une catégorie.

---

## 10. Méthode de travail

Procède par étapes. **Arrête-toi à la fin de chaque étape** pour que je valide avant de continuer :

1. **Initialisation et design** : projet Next.js + Payload, design system, page d'accueil statique avec données fictives → validation du design.
2. **Données** : collections Payload, back-office, seed.
3. **Pages publiques** : accueil, catalogue, catégories, fiche programme, recherche, lecteur.
4. **Comptes et abonnement** (selon le périmètre coché) : auth, paiement, « Mon compte », protection des vidéos.
5. **Qualité** : SEO, redirections, performance, accessibilité, tests Playwright.
6. **Mise en production** : Docker, déploiement, migration des contenus, documentation.

À chaque étape : lance le lint, le typecheck et les tests, et donne-moi un récapitulatif court de ce qui est fait et de ce qui reste.
