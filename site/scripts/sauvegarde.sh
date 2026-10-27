#!/usr/bin/env bash
# Sauvegarde de Swatter TV Info sur le serveur (Docker Compose) : base PostgreSQL (pg_dump, format compressé) et fichiers
# envoyés (volume « media »), dans SAUVEGARDE_DIR (/var/backups/swatter par défaut), gardés SAUVEGARDE_JOURS jours (14 par
# défaut). Lancé chaque nuit par cron (tâche installée par deploy/installer.sh) ; code d'erreur si quelque chose échoue.
# Restauration : deploy/restaurer.sh AAAA-MM-JJ.
set -euo pipefail
# Lisibles par leur seul propriétaire : la base contient les comptes (e-mails, mots de passe chiffrés)
umask 077

cd "$(dirname "$0")/.."
DEST="${SAUVEGARDE_DIR:-/var/backups/swatter}"
JOURS="${SAUVEGARDE_JOURS:-14}"
MEDIA_VOLUME="${MEDIA_VOLUME:-swatter-tv_media}"
DATE="$(date +%F)"
base="$DEST/swatter-$DATE.dump"
media="$DEST/media-$DATE.tar.gz"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

mkdir -p "$DEST"
# Fichiers « .part » renommés seulement une fois complets : une sauvegarde interrompue ne passe jamais pour bonne
trap 'rm -f "$base.part" "$media.part"' EXIT

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$base.part"
# L'archive doit être lisible par pg_restore
docker compose exec -T db pg_restore --list < "$base.part" > /dev/null
mv "$base.part" "$base"
log "base : $base ($(du -h "$base" | cut -f1))"

# Médias : volume Docker (rien à archiver si les fichiers sont sur S3 / R2)
if docker volume inspect "$MEDIA_VOLUME" > /dev/null 2>&1; then
  docker run --rm -v "$MEDIA_VOLUME":/media:ro alpine:3 tar czf - -C /media . > "$media.part"
  mv "$media.part" "$media"
  log "médias : $media ($(du -h "$media" | cut -f1))"
else
  log "médias : pas de volume $MEDIA_VOLUME (fichiers sur S3 / R2 ?), rien à archiver"
fi

find "$DEST" -maxdepth 1 -type f \( -name 'swatter-*.dump' -o -name 'media-*.tar.gz' \) -mtime +"$JOURS" -delete
log "terminé : $(find "$DEST" -maxdepth 1 -type f -name 'swatter-*.dump' | wc -l) sauvegarde(s) de la base dans $DEST"
