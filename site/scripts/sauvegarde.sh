#!/usr/bin/env bash
# Sauvegarde de Swatter TV Info sur le serveur (Docker Compose) : base PostgreSQL (pg_dump, format compressé) et fichiers
# envoyés (volume « media »), dans SAUVEGARDE_DIR (/var/backups/swatter par défaut). La base est gardée SAUVEGARDE_JOURS
# jours (14 par défaut) ; l'archive des médias, copie complète des photos et vidéos chaque jour, SAUVEGARDE_MEDIA_JOURS
# jours (3 par défaut : sur le disque de 40 Go du VPS-1, deux semaines de copies des vidéos l'avaient rempli). Les
# anciennes sauvegardes sont effacées avant d'écrire celles du jour, et l'archive des médias n'est faite que s'il reste
# assez de place (sinon, code d'erreur et message : la base, elle, est sauvegardée).
# Lancé chaque nuit par cron (tâche installée par deploy/installer.sh) ; code d'erreur si quelque chose échoue.
# Restauration : deploy/restaurer.sh AAAA-MM-JJ.
set -euo pipefail
# Lisibles par leur seul propriétaire : la base contient les comptes (e-mails, mots de passe chiffrés)
umask 077

cd "$(dirname "$0")/.."
DEST="${SAUVEGARDE_DIR:-/var/backups/swatter}"
JOURS="${SAUVEGARDE_JOURS:-14}"
JOURS_MEDIA="${SAUVEGARDE_MEDIA_JOURS:-3}"
MEDIA_VOLUME="${MEDIA_VOLUME:-swatter-tv_media}"
DATE="$(date +%F)"
base="$DEST/swatter-$DATE.dump"
media="$DEST/media-$DATE.tar"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

if ! mkdir -p "$DEST" 2> /dev/null || [ ! -w "$DEST" ]; then
  echo "Dossier des sauvegardes $DEST impossible à créer ou à écrire. Créez-le une fois :" >&2
  echo "  sudo install -d -o $(id -un) -g $(id -gn) -m 750 $DEST" >&2
  exit 1
fi
# Fichiers « .part » renommés seulement une fois complets : une sauvegarde interrompue ne passe jamais pour bonne
trap 'rm -f "$base.part" "$media.part"' EXIT

# Anciennes sauvegardes effacées d'abord : la place qu'elles occupaient sert à celles du jour
find "$DEST" -maxdepth 1 -type f -name 'swatter-*.dump' -mtime +"$JOURS" -delete
find "$DEST" -maxdepth 1 -type f \( -name 'media-*.tar' -o -name 'media-*.tar.gz' \) -mtime +"$JOURS_MEDIA" -delete

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$base.part"
# L'archive doit être lisible par pg_restore
docker compose exec -T db pg_restore --list < "$base.part" > /dev/null
mv "$base.part" "$base"
log "base : $base ($(du -h "$base" | cut -f1))"

# Médias : volume Docker (rien à archiver si les fichiers sont sur S3 / R2)
if docker volume inspect "$MEDIA_VOLUME" > /dev/null 2>&1; then
  # Place nécessaire : la taille des fichiers (l'archive fait la même), plus 1 Go de marge. Faute de place, pas
  # d'archive : le disque plein arrêterait aussi le site.
  besoin=$(($(docker run --rm -v "$MEDIA_VOLUME":/media:ro alpine:3 du -sk /media | cut -f1) + 1048576))
  libre=$(df -Pk "$DEST" | awk 'NR == 2 { print $4 }')
  if [ "$libre" -lt "$besoin" ]; then
    log "médias : pas assez de place dans $DEST ($((libre / 1048576)) Go libres, $((besoin / 1048576 + 1)) Go nécessaires) : archive non faite. Voir DEPLOIEMENT.md, « Disque plein »."
    exit 1
  fi
  # Archive écrite par le conteneur directement dans le dossier des sauvegardes, jamais par sa sortie standard : Docker
  # recopie celle-ci dans le journal du conteneur, quatre fois plus gros que l'archive (2,7 Go de vidéos : 11 Go de
  # journal, de quoi remplir le disque). Sans compression : photos et vidéos le sont déjà (elle ne faisait gagner presque
  # rien et occupait le processeur plusieurs minutes). Fichier rendu au compte qui sauvegarde, lisible par lui seul.
  docker run --rm --log-driver none -v "$MEDIA_VOLUME":/media:ro -v "$DEST":/sauvegarde alpine:3 \
    sh -c 'tar cf "/sauvegarde/$1" -C /media . && chown "$2" "/sauvegarde/$1" && chmod 600 "/sauvegarde/$1"' archive \
    "$(basename "$media.part")" "$(id -u):$(id -g)"
  mv "$media.part" "$media"
  # archive compressée du même jour (format d'avant) : remplacée
  rm -f "$DEST/media-$DATE.tar.gz"
  log "médias : $media ($(du -h "$media" | cut -f1))"
else
  log "médias : pas de volume $MEDIA_VOLUME (fichiers sur S3 / R2 ?), rien à archiver"
fi

log "terminé : $(find "$DEST" -maxdepth 1 -type f -name 'swatter-*.dump' | wc -l) sauvegarde(s) de la base dans $DEST"
