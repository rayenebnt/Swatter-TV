# Guide de l’administration — Swatter TV

Bienvenue ! Ce guide vous accompagne pas à pas pour faire vivre le site de **Swatter TV & Info** : ajouter une vidéo,
publier une info, annoncer une sortie, mettre à jour la grille des programmes… Aucune compétence technique n’est
nécessaire. Chaque partie correspond à une tâche : allez directement à celle dont vous avez besoin.

> Bon à savoir : un contenu enregistré est **en ligne aussitôt** (il n’y a pas de brouillon). Le site se met à jour
> en moins d’une minute ; si une page semble ne pas avoir changé, rechargez-la.

## Sommaire

1. [Avant de commencer : ce qu’il vous reste à compléter](#1-avant-de-commencer--ce-quil-vous-reste-à-compléter)
2. [Se connecter](#2-se-connecter)
3. [Se repérer dans l’administration](#3-se-repérer-dans-ladministration)
4. [Ajouter une vidéo](#4-ajouter-une-vidéo)
5. [La vidéo du jour et le Top 10](#5-la-vidéo-du-jour-et-le-top-10)
6. [Publier un article et choisir l’info du jour](#6-publier-un-article-et-choisir-linfo-du-jour)
7. [Annoncer un événement et la sortie du week-end](#7-annoncer-un-événement-et-la-sortie-du-week-end)
8. [Les émissions et la grille des programmes](#8-les-émissions-et-la-grille-des-programmes)
9. [Les replays](#9-les-replays)
10. [Les webcams](#10-les-webcams)
11. [Les publicités](#11-les-publicités)
12. [Le carrousel de l’accueil](#12-le-carrousel-de-laccueil)
13. [Le direct](#13-le-direct)
14. [Le flash info](#14-le-flash-info)
15. [Les pages (mentions légales, le groupe…)](#15-les-pages-mentions-légales-le-groupe)
16. [Les flux RSS](#16-les-flux-rss)
17. [La météo](#17-la-météo)
18. [Le référencement (bloc SEO)](#18-le-référencement-bloc-seo)
19. [Les redirections](#19-les-redirections)
20. [Les utilisateurs et les rôles](#20-les-utilisateurs-et-les-rôles)
21. [Bien préparer ses images](#21-bien-préparer-ses-images)

---

## 1. Avant de commencer : ce qu’il vous reste à compléter

Quelques informations ne pouvaient pas être inventées : merci de les renseigner avant l’ouverture du site.

| Où | Quoi |
|---|---|
| **Réglages du site** › onglet **Chaîne et contact** › **Réseaux sociaux** | les adresses de vos pages Facebook, Instagram, YouTube et TikTok (une case vide = l’icône n’apparaît pas) |
| **Réglages du site** › **Chaîne et contact** › **Contact** › **Téléphone** | votre numéro, ou une mention comme « Uniquement par mail » |
| **Pages** › **Mentions légales** | forme juridique, capital, SIRET, directeur de la publication, hébergeur : remplacez chaque « [à compléter] » |
| **Pages** › **Canaux de réception** | les box des opérateurs et numéros de canal |
| **Pages** › **Crédits** | la conception et le développement du site |

Si votre site contient encore des contenus d’exemple (vidéos, articles, événements de démonstration), supprimez-les ou
remplacez-les par les vôtres avant l’ouverture.

## 2. Se connecter

1. Ouvrez **https://www.swatter-tv.fr/admin** (ajoutez cette adresse à vos favoris).
2. Saisissez votre **E-mail** et votre **Mot de passe**, puis cliquez sur **Se connecter**.

- Après 5 essais erronés, le compte est bloqué 10 minutes : patientez, puis réessayez.
- Mot de passe perdu : demandez à un administrateur de vous en définir un nouveau (fiche **Utilisateurs**).
- Pour changer votre mot de passe : cliquez sur l’avatar en haut à droite (page **Compte**), puis sur **Changer le mot de passe**.
- Pensez à vous déconnecter (**Se déconnecter**) sur un ordinateur partagé.

## 3. Se repérer dans l’administration

Le **Tableau de bord** regroupe tout en trois familles :

- **Contenus** : Vidéos, Replays, L’Info (articles), Agenda, Webcams, Publicités, Pages, Médiathèque ;
- **Programme TV** : Émissions, Grille des programmes ;
- **Réglages** : Flux RSS (import de l’info), Utilisateurs, Redirections, Réglages du site, Météo.

Dans chaque liste : le bouton **Créer un(e) nouveau ou nouvelle** ajoute un élément, la barre de recherche et les
**Filtres** aident à retrouver un contenu, et un clic sur une ligne l’ouvre. Dans une fiche : **Sauvegarder** enregistre
(et met en ligne) ; le menu « ⋯ » permet de **Dupliquer** ou de **Supprimer**. Les champs marqués d’une étoile sont
obligatoires.

Les champs **Adresse (slug)** (à droite des fiches) se remplissent tout seuls à partir du titre : laissez-les vides.
Évitez de modifier l’adresse d’un contenu déjà publié et partagé (sinon, créez une redirection, voir partie 19).

## 4. Ajouter une vidéo

**Contenus › Vidéos › Créer un(e) nouveau ou nouvelle**

1. **Titre** : court et parlant.
2. **Catégorie** (Divertissement, Séries-réalité, Séries, Cinéma, Documentaire, Nature, Sport, Info, Magazine) et
   **Durée** (par exemple `02:14` ou `1:34:00`).
3. **Image (vignette)** : l’image affichée sur les cartes (voir partie 21).
4. **Vidéo** › **Type de source**, puis le champ correspondant :
   - **YouTube (lien de la vidéo)** : collez le lien de la vidéo (`https://www.youtube.com/watch?v=…`) ;
   - **Bunny Stream (identifiant)** : l’identifiant visible dans Bunny Stream › votre vidéo ;
   - **Lien direct (MP4 ou flux HLS .m3u8)** : l’adresse d’un fichier MP4 ou d’un flux ;
   - **Fichier envoyé** : un fichier MP4 ou WebM déposé dans la médiathèque (réservé aux vidéos courtes : préférez
     YouTube ou Bunny Stream, plus légers pour le site).
5. **Description** : quelques lignes, affichées sous le lecteur.
6. À droite : **Date de publication** (maintenant par défaut).
7. **Sauvegarder**.

Les vidéos YouTube et Bunny ne se lancent qu’avec l’accord du visiteur pour les « contenus externes » (bandeau cookies) :
sinon, le lecteur l’invite à modifier son choix. Le **Nombre de vues** est affiché pour information et ne se modifie pas.

## 5. La vidéo du jour et le Top 10

- **Vidéo du jour** : dans la fiche d’une vidéo, cochez **Vidéo du jour** (colonne de droite). Elle s’affiche en grand
  dans « À la une » sur l’accueil. Si plusieurs vidéos sont cochées, c’est la plus récente qui l’emporte ; si aucune ne
  l’est, la dernière vidéo publiée est mise en avant. Pensez à décocher l’ancienne.
- **Top 10** : renseignez **Place dans le Top 10** (de 1 à 10) sur les vidéos de votre choix. Les places laissées libres
  sont complétées automatiquement par les vidéos les plus vues. Pour sortir une vidéo du classement, videz le champ.

## 6. Publier un article et choisir l’info du jour

**Contenus › L’Info (articles) › Créer un(e) nouveau ou nouvelle**

1. **Titre**, puis **Chapô (résumé)** : 2 ou 3 lignes affichées sous le titre et dans les listes.
2. **Texte de l’article** : l’éditeur fonctionne comme un traitement de texte (intertitres, gras, listes, liens,
   citations). Sélectionnez un mot pour faire apparaître la barre de mise en forme ; tapez « / » pour insérer un bloc.
3. **Image** : la photo principale.
4. **Département** (obligatoire : il range l’article dans la bonne rubrique, par exemple « /info/haute-savoie »),
   **Commune** et **Rubrique** (Sport, Faits divers, Société…).
5. À droite : **Date de publication**. Une date future programme la mise en ligne : l’article apparaîtra tout seul à
   cette date.
6. **Sauvegarder**.

**Info du jour** : cochez **Info du jour** (à droite) pour placer l’article dans « À la une ». Comme pour la vidéo du
jour, la plus récente des infos cochées l’emporte, et à défaut le dernier article publié est mis en avant.

Les articles importés automatiquement (partie 16) portent l’**Origine** « Flux RSS », avec leur **Source** et le **Lien
de l’article d’origine** ; vous pouvez les corriger ou les supprimer comme les autres.

## 7. Annoncer un événement et la sortie du week-end

**Contenus › Agenda › Créer un(e) nouveau ou nouvelle**

1. **Titre**, **Date de début** (jour et heure) et, si l’événement dure, **Date de fin**.
2. **Commune** (obligatoire), **Lieu** (salle, place…) et **Catégorie** (Terroir, Musique, Sport, Famille, Culture,
   Fête, Marché, Autre) : elle sert aux filtres de la page Agenda.
3. **Affiche / image** et **Présentation**.
4. **Programme de la journée** (facultatif) : ajoutez un **Moment** par horaire, avec **Horaire** (`10h30` ou
   « Toute la journée ») et **Description**.
5. **Lien externe** : billetterie, office de tourisme…
6. **Sauvegarder**.

Les événements passés disparaissent d’eux-mêmes de l’agenda. **Sortie du week-end** : cochez la case (à droite) sur
l’événement à mettre en avant dans « À la une » et sur l’accueil ; c’est le prochain événement coché qui est affiché
(à défaut, le prochain événement de l’agenda).

## 8. Les émissions et la grille des programmes

**Programme TV › Émissions** : la fiche de chaque émission, créée une fois pour toutes : **Titre**, **Genre** (Info,
Météo, Documentaire, Magazine, Agenda, Divertissement, Sport, Série, Cinéma), **Image**, **Résumé** et, à droite,
**Inédit** (badge affiché dans la grille).

**Programme TV › Grille des programmes** : un **créneau** par diffusion.

1. **Début** : date et heure de diffusion (heure de Paris).
2. **Durée (minutes)**.
3. **Émission** : choisissez-la dans la liste.
4. **Titre spécifique (facultatif)** : par exemple « Le journal des Alpes — Soir » ; sinon, le titre de l’émission est
   utilisé.
5. **Sauvegarder**.

Astuce : pour une semaine qui ressemble à la précédente, ouvrez un créneau, **Dupliquez**-le et changez simplement la
date. La page « Programme TV » et l’accueil (« en ce moment », « ce soir ») se mettent à jour d’après cette grille.

## 9. Les replays

**Contenus › Replays › Créer un(e) nouveau ou nouvelle** : **Titre**, **Émission** (pour regrouper les épisodes),
**Image (vignette)**, **Vidéo** (mêmes types de source que pour les vidéos, partie 4), **Diffusé le**, **Durée**
(`52 min`) et **Description**. Les replays s’affichent du plus récent au plus ancien, et la page Replay peut être filtrée
par émission.

## 10. Les webcams

**Contenus › Webcams › Créer un(e) nouveau ou nouvelle**

1. **Nom** (« Lac du Bourget ») et **Lieu précis** (« Port d’Aix-les-Bains »).
2. **Type de flux**, puis **Lien du flux** :
   - **Lecteur à intégrer (lien iframe : Windy, Skaping, ViewSurf…)** : le lien « intégrer » fourni par le service ;
   - **Flux vidéo HLS (.m3u8)** : l’adresse du flux ;
   - **YouTube Live** : le lien du direct YouTube ;
   - **Image rafraîchie (lien vers une image)** : l’adresse d’une image mise à jour par la caméra (rechargée chaque minute).
3. **Vignette** : image affichée avant l’ouverture du flux.
4. **Température affichée (facultatif)** (« 13° ») et **Ordre** (les petits numéros d’abord).
5. **Active** (à droite) : décochez pour masquer une webcam en panne sans la supprimer.

## 11. Les publicités

**Contenus › Publicités › Créer un(e) nouveau ou nouvelle**

1. **Annonceur / campagne** : un nom pour retrouver la campagne dans la liste.
2. **Emplacement** : **Accueil — bannière horizontale** ou **Pages intérieures — bannière** (vidéos, info, agenda…).
3. **Visuel (bureau, 970 × 250)** et, conseillé, **Visuel mobile (facultatif, 320 × 100)** : sans lui, le visuel bureau
   est réduit sur téléphone et devient peu lisible.
4. **Lien** : la page de l’annonceur (adresse complète, `https://…`).
5. **Début** et **Fin** : la bannière s’affiche seulement entre ces dates (laissez vide pour « dès maintenant » ou
   « sans limite »).
6. **Active** (à droite).

Une seule bannière par emplacement : la plus récente des campagnes actives et en cours. Sans campagne, un encart
« Espace partenaire » invite les annonceurs à vous écrire.

## 12. Le carrousel de l’accueil

**Réglages › Réglages du site** › onglet **Accueil (carrousel)** › **Diapositives du carrousel** (5 au maximum,
3 conseillées). Pour chaque **Diapositive** :

- **Type** : **Le direct** (affiche « En direct » et la progression du programme en cours) ou **Mise en avant libre** ;
- **Étiquettes** (3 au maximum) : un **Texte** et un **Style** (**Rouge (direct)**, **Or** ou **Transparent**) ;
- **Titre — ligne 1 (blanc)** et **Titre — ligne 2 (dorée)** : quelques mots chacun ;
- **Texte** : une ou deux phrases ;
- **Image de fond (2400 px de large conseillés)** : une image paysage, sujet plutôt à droite (le texte est à gauche) ;
- **Libellé court (vignette de navigation)** : « Ce soir », « Ce week-end »… ;
- **Bouton principal** et **Bouton secondaire** : un texte et un lien (adresse d’une page du site comme
  `/programme-tv`, ou adresse complète).

Glissez les diapositives (poignée à gauche) pour changer leur ordre, puis **Sauvegarder**.

## 13. Le direct

**Réglages du site** › onglet **Le direct** :

- **Direct actif** : décochez-le pendant une interruption ; la page « Le direct » affiche alors un message d’attente ;
- **Flux du direct** › **Type de source** : YouTube, Bunny Stream, **Lien direct** (flux HLS `.m3u8` de votre diffuseur)
  ou fichier envoyé ;
- **Image affichée avant la lecture** : une belle image de la chaîne.

## 14. Le flash info

**Réglages du site** › onglet **Flash info** : le bandeau défilant de l’accueil.

- **Messages** (10 au maximum) : un **Lieu / thème (en doré)**, le **Message** et un **Lien (facultatif)** vers
  l’article ;
- **Compléter automatiquement avec les derniers articles** : ajoute les titres des derniers articles à vos messages.
  Décochez-la pour n’afficher que vos messages.

## 15. Les pages (mentions légales, le groupe…)

**Contenus › Pages** : les pages fixes (Canaux de réception, Le groupe, Crédits, Vie privée, Mentions légales).
Chaque page a un **Titre**, une **Introduction**, un **Contenu** (même éditeur que les articles) et, à droite, un
**Lien dans le pied de page** : **Colonne « La chaîne »**, **Colonne « Swatter TV »** ou aucun. Une nouvelle page est
accessible à l’adresse `/son-adresse` (champ **Adresse (slug)**).

## 16. Les flux RSS

**Deux sens à ne pas confondre :**

- **Importer l’actualité d’autres sites** : **Réglages › Flux RSS (import de l’info)** › créez un flux avec son **Nom**,
  l’**Adresse du flux RSS**, le **Département** de rangement et, si besoin, une **Commune par défaut** et une **Rubrique par
  défaut**. Cochez **Actif**. Toutes les heures, les nouveaux articles du flux sont ajoutés à « L’Info » (sans doublon).
  **Dernier import** et **Dernière erreur** vous indiquent si tout se passe bien. Vérifiez que vous avez le droit de
  reprendre ces contenus.
- **Partager votre actualité** : le site publie son propre flux, avec les articles de la rédaction, à l’adresse
  **https://www.swatter-tv.fr/info/rss.xml** (à donner aux partenaires et aux agrégateurs).

## 17. La météo

**Réglages › Météo** : les prévisions (Annecy, Chamonix, Chambéry, Lyon, Grenoble, Thonon-les-Bains) arrivent
**automatiquement toutes les heures** grâce à Open-Meteo, tant que **Mise à jour automatique (toutes les heures)** est
cochée. **Dernière mise à jour** indique l’heure du dernier passage.

Pour écrire vous-même le texte du jour, remplissez **Bulletin du jour (facultatif)** : il remplace le texte généré
automatiquement pour aujourd’hui. Videz-le le lendemain. Les **Prévisions (données automatiques)** ne se modifient pas
à la main.

## 18. Le référencement (bloc SEO)

En bas des fiches de vidéos, replays, articles, événements, pages et émissions, le bloc **SEO** règle la façon dont
le contenu apparaît dans Google et sur les réseaux sociaux :

- **Titre** (50 à 60 caractères environ) et **Description** (100 à 150 caractères environ) : le bouton
  **Auto-générer** les remplit à partir du titre et du résumé ; les indicateurs « Trop court », « Trop long » et
  « Bien » vous guident ;
- **Image** : l’image de partage (à défaut, l’image principale du contenu est utilisée) ;
- **Aperçu** : la présentation probable dans les résultats de recherche.

Ce bloc est facultatif : laissé vide, le site utilise le titre, le chapô (ou la description) et l’image du contenu.

## 19. Les redirections

**Réglages › Redirections** : pour qu’une ancienne adresse mène à la bonne page (après un changement d’adresse, ou pour
une adresse imprimée sur un flyer).

1. **URL d’origine** : l’ancienne adresse, à partir du « / » (par exemple `/programme`).
2. **Type d’URL de destination** : **Référence vers une page** (choisissez une page, un article, une vidéo, un replay ou
   un événement : la redirection suivra même si son adresse change) ou **URL personnalisée** (saisissez l’adresse).
3. **Sauvegarder**.

Les anciennes adresses du site précédent (/Le-Direct, /L-info, /La-Meteo…) sont déjà redirigées. L’URL d’origine ne doit
pas être une adresse qui existe déjà sur le site.

## 20. Les utilisateurs et les rôles

**Réglages › Utilisateurs** (réservé aux administrateurs) : **Créer un(e) nouveau ou nouvelle**, puis **E-mail**,
**Nom**, mot de passe et **Rôle** :

- **Administrateur** : tout, y compris créer et supprimer des comptes et changer les rôles ;
- **Éditeur** : tous les contenus et réglages, mais pas la gestion des comptes (il peut modifier son propre profil).

Un compte par personne, jamais de mot de passe partagé ; supprimez les comptes des personnes qui quittent l’équipe.
Gardez au moins deux administrateurs.

## 21. Bien préparer ses images

- **Format** : JPEG pour les photos (PNG pour les logos). Le site les convertit lui-même en formats modernes et
  légers : inutile de les optimiser à l’excès.
- **Taille** : 1920 px de large au minimum pour les vignettes et les articles (format paysage 16/9), **2400 px** pour le
  carrousel de l’accueil, une affiche en hauteur pour les événements, **970 × 250** et **320 × 100** pour les publicités.
- **Poids** : moins de 2 Mo par image ; pour les vidéos, préférez YouTube ou Bunny Stream à l’envoi de gros fichiers.
- **Texte alternatif** (obligatoire dans la **Médiathèque**) : décrivez ce que montre l’image en une phrase
  (« Le lac d’Annecy au lever du soleil »). Il sert aux personnes malvoyantes et au référencement.
- **Crédit** : le nom du photographe ou de l’agence, si besoin.
- **Point focal** : les images sont recadrées différemment selon l’écran (téléphone, ordinateur, carrousel). Dans la
  médiathèque, ouvrez l’image, choisissez **Définir le point focal** et cliquez sur le sujet principal (un visage, un
  sommet) : il restera visible dans tous les cadrages. **Recadrer** permet aussi de couper les bords inutiles.
- Une image déjà envoyée peut être réutilisée partout : dans un champ image, choisissez **Choisir parmi les
  existant(e)s** plutôt que de l’envoyer une seconde fois.

---

Une question, un souci ? Notez la page concernée et, si possible, faites une capture d’écran : votre prestataire
technique pourra ainsi vous répondre plus vite.
