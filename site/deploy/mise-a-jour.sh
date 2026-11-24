#!/usr/bin/env bash
# Met le site à jour avec la dernière version du code (DEPLOIEMENT.md, « Au quotidien ») : place sur le disque,
# sauvegarde, code, reconstruction (les migrations s'appliquent seules). CONSTRUIRE=0 : réutilise les images déjà construites.
set -euo pipefail
cd "$(dirname "$0")/.."

# Place libre sur le disque, en Go entiers
libre() { df -Pk / | awk 'NR == 2 { print int($4 / 1048576) }'; }

# La sauvegarde (archive des photos et vidéos) et la reconstruction demandent de la place. Le cache de construction de
# Docker grossit à chaque mise à jour : il est vidé s'il en manque (la reconstruction est alors un peu plus longue).
if [ "$(libre)" -lt 8 ]; then
  echo "Place libre sur le disque : $(libre) Go. Nettoyage du cache de construction de Docker…"
  docker builder prune -af > /dev/null
  docker image prune -f > /dev/null
  echo "Place libre après le nettoyage : $(libre) Go."
fi
if [ "$(libre)" -lt 4 ]; then
  echo "Disque presque plein ($(libre) Go libres, il en faut au moins 4) : mise à jour annulée, rien n'a été modifié." >&2
  echo "Voir DEPLOIEMENT.md, « Disque plein » (place prise : du -sh /var/backups/swatter ; docker system df)." >&2
  exit 1
fi

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
# Cache de construction inutilisé depuis plus de 3 jours, tout entier (--all) : sans --all, presque rien n'était effacé
# et le cache, 16 Go, avait rempli le disque de 40 Go du VPS-1
docker builder prune -af --filter until=72h > /dev/null
echo "Site à jour."
