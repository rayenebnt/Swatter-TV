#!/usr/bin/env bash
# Restaure la sauvegarde d'une date, base et fichiers envoyés (DEPLOIEMENT.md, « Au quotidien ») :
#   deploy/restaurer.sh AAAA-MM-JJ        (liste des sauvegardes : ls /var/backups/swatter)
# Les fichiers de la sauvegarde sont remis par-dessus ceux du serveur, sans rien effacer. CONFIRMER=oui : sans question.
set -euo pipefail
cd "$(dirname "$0")/.."

DATE="${1:?Indiquez la date de la sauvegarde, par exemple : deploy/restaurer.sh $(date +%F)}"
DEST="${SAUVEGARDE_DIR:-/var/backups/swatter}"
MEDIA_VOLUME="${MEDIA_VOLUME:-swatter-tv_media}"
[ -f "$DEST/swatter-$DATE.dump" ] || { echo "Pas de sauvegarde de la base du $DATE dans $DEST."; exit 1; }
[ -n "${CONFIRMER:-}" ] || read -rp "Le contenu actuel du site sera remplacé par celui du $DATE. Continuer ? (oui/non) " CONFIRMER < /dev/tty
[ "$CONFIRMER" = oui ] || { echo "Rien n'a été modifié."; exit 1; }

docker compose stop app cron
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$DEST/swatter-$DATE.dump"
if [ -f "$DEST/media-$DATE.tar.gz" ]; then
  docker run --rm -v "$MEDIA_VOLUME":/media -v "$DEST":/sauvegarde:ro alpine:3 tar xzf "/sauvegarde/media-$DATE.tar.gz" -C /media
fi
docker compose up -d --force-recreate app cron
echo "Sauvegarde du $DATE restaurée."
