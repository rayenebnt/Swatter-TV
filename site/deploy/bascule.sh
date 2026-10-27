#!/usr/bin/env bash
# Jour J (DEPLOIEMENT.md, étape 5) : le site passe sur https://www.swatter-tv.fr, sans mot de passe. À lancer une fois que
# le client a fait pointer www.swatter-tv.fr et swatter-tv.fr vers ce serveur (FORCER=1 : sans vérifier le DNS ;
# CONSTRUIRE=0 : réutilise les images déjà construites).
set -euo pipefail
cd "$(dirname "$0")/.."

regler() {
  local tmp
  tmp="$(mktemp)"
  awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 { print k "=" v; vu = 1; next } { print } END { if (!vu) print k "=" v }' .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

if [ "${FORCER:-0}" != 1 ]; then
  IP4="$(ip -4 route get 1.1.1.1 2> /dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1) }')" || IP4=""
  [ -n "$IP4" ] || { echo "Adresse IP du serveur introuvable. Si le DNS a bien été changé : FORCER=1 $0"; exit 1; }
  for nom in www.swatter-tv.fr swatter-tv.fr; do
    getent ahostsv4 "$nom" | grep -qwF "$IP4" || {
      echo "$nom ne pointe pas encore vers ce serveur ($IP4) : attendez que le client ait changé le DNS, puis relancez."
      exit 1
    }
  done
fi

./scripts/sauvegarde.sh
regler NEXT_PUBLIC_SITE_URL https://www.swatter-tv.fr
regler CADDY_CONFIG final
if [ "${CONSTRUIRE:-1}" = 1 ]; then docker compose up -d --build; else docker compose up -d --no-build; fi
echo "En ligne : https://www.swatter-tv.fr (le certificat HTTPS arrive en quelques minutes)."
