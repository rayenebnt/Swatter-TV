# Maquette — Swatter TV (v2)

Proposition de design pour la refonte du site : page d'accueil complète, responsive et animée.

| Fichier | Usage |
|---|---|
| `swatter-tv-maquette.html` | **À envoyer au client** : un seul fichier (2,3 Mo), s'ouvre par double-clic, fonctionne hors ligne |
| `apercus/demo-animations.mp4` | Vidéo de 55 s qui montre les animations et les interactions |
| `apercus/*.jpg` | Captures desktop et mobile (premier écran et page complète) |
| `index.html` + `assets/` | Source de la maquette |
| `build.py` | Régénère `swatter-tv-maquette.html` après une modification : `python3 build.py` |
| `outils/render.c` | Moteur qui a calculé les paysages 3D provisoires (`assets/visuels/`) |

## Charte

- **Bleu Nuit Alpin** (`#071224`) : couleur principale.
- **Or Swatter** (`#D9AA45`, en dégradé) : couleur secondaire, pour les actions et les mises en avant.
- **Rouge** : réservé au direct.
- **Typographies** : Outfit et Inter (licence SIL OFL), intégrées au fichier.

## Ce que montre la v2

- Carrousel plein écran (direct, programme du soir, sortie du week-end) : zoom lent, transitions en fondu, textes révélés ligne par ligne, barres de progression, parallaxe à la souris, neige légère, balayage sur mobile.
- « À la une » en mosaïque, Top 10 avec grands chiffres dorés, rails déplaçables à la souris.
- Info avec filtres par département et fil « En continu ».
- Météo animée : icônes, courbe des températures, onglets par jour.
- Programme TV en grille horaire avec la ligne « maintenant » et le programme en cours.
- Webcams en mouvement avec horloge, recherche instantanée (touche `/`), menu et barre de navigation sur mobile.

## Performances mesurées (Chromium sans carte graphique)

- 60 images/s pendant les animations, sur ordinateur comme sur mobile.
- Affichage principal en 0,3 s, décalage de mise en page 0,002.
- Aucune erreur JavaScript, aucun débordement horizontal, de 390 px à 1440 px.
- Les animations se mettent en pause hors écran et quand l'onglet est caché. Elles sont désactivées si l'utilisateur a demandé à réduire les animations.

## Limites de la maquette

- Les paysages de montagne sont des **rendus 3D provisoires**. Le site final utilisera les photos et vidéos de la chaîne.
- Les vignettes réelles (renardeau, Démontagnée, stade, actus) sont des captures basse résolution du site actuel.
- Le logo est une reconstitution, à remplacer par le fichier vectoriel officiel.
- Les titres de programmes, d'événements et les données météo sont des exemples.
