#!/usr/bin/env bash
# Met le site à jour avec la dernière version du code (DEPLOIEMENT.md, « Au quotidien ») : sauvegarde, code,
# reconstruction (les migrations s'appliquent seules). CONSTRUIRE=0 : réutilise les images déjà construites.
set -euo pipefail
cd "$(dirname "$0")/.."

./scripts/sauvegarde.sh
git pull --ff-only
if [ "${CONSTRUIRE:-1}" = 1 ]; then docker compose up -d --build; else docker compose up -d --no-build; fi
# Image et aperçu animé des vidéos et replays qui n'en ont pas encore (quelques secondes par vidéo) : en arrière-plan,
# le site reste en ligne pendant ce temps ; suivi avec « docker logs -f swatter-apercus »
if docker compose run -d --rm --name swatter-apercus tools npm run apercus > /dev/null 2>&1; then
  echo "Images et aperçus animés des vidéos existantes : préparation en arrière-plan (suivi : docker logs -f swatter-apercus)."
else
  echo "Préparation des images et aperçus animés déjà en cours (ou impossible) : relancez plus tard « docker compose run --rm tools npm run apercus »."
fi
docker image prune -f > /dev/null
# Cache de construction de plus d'une semaine : le disque du VPS-1 fait 40 Go
docker builder prune -f --filter until=168h > /dev/null
echo "Site à jour."
