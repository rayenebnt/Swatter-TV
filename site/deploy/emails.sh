#!/usr/bin/env bash
# E-mails du site par Brevo (DEPLOIEMENT.md, étape 4) : enregistre l'identifiant et la clé SMTP dans .env, relance le site
# et envoie un e-mail d'essai. Réponses possibles par variables (BREVO_IDENTIFIANT, BREVO_CLE, EMAIL_ESSAI).
set -euo pipefail
cd "$(dirname "$0")/.."

regler() {
  local tmp
  tmp="$(mktemp)"
  awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 { print k "=" v; vu = 1; next } { print } END { if (!vu) print k "=" v }' .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

[ -n "${BREVO_IDENTIFIANT:-}" ] || read -rp "Identifiant SMTP de Brevo (rubrique « SMTP & API ») : " BREVO_IDENTIFIANT < /dev/tty
[ -n "${BREVO_CLE:-}" ] || { read -rsp "Clé SMTP de Brevo : " BREVO_CLE < /dev/tty && echo; }
[ -n "${EMAIL_ESSAI:-}" ] || read -rp "Votre e-mail, pour recevoir l'e-mail d'essai : " EMAIL_ESSAI < /dev/tty

regler SMTP_HOST smtp-relay.brevo.com
regler SMTP_PORT 587
regler SMTP_USER "$BREVO_IDENTIFIANT"
regler SMTP_PASS "'$BREVO_CLE'"
regler SMTP_FROM contact@swatter-tv.fr
docker compose up -d
docker compose run --rm tools npm run test-email -- "$EMAIL_ESSAI"
