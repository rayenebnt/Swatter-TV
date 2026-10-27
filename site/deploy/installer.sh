#!/usr/bin/env bash
# Installe Swatter TV Info sur un serveur Ubuntu neuf (VPS OVHcloud), en une commande (DEPLOIEMENT.md, étape 3) :
#   curl -fsSL https://raw.githubusercontent.com/rayenebnt/Swatter-TV/claude/loving-curie-ftnboh/site/deploy/installer.sh | sudo bash
# Trois questions, puis : mises à jour et pare-feu, Docker, code du site, réglages (.env, secrets tirés au hasard),
# construction et démarrage, premier administrateur, contenus de départ, Caddy (HTTPS et mot de passe provisoire) et
# sauvegarde chaque nuit. Relançable sans risque : ni les réglages ni les contenus ne sont écrasés.
# Réponses possibles par variables d'environnement (ADMIN_EMAIL, ADMIN_PASSWORD, MOT_DE_PASSE_SITE) ; SANS_SYSTEME=1
# saute la préparation du système, CONSTRUIRE=0 réutilise les images déjà construites.
set -euo pipefail

DEPOT="${DEPOT:-https://github.com/rayenebnt/Swatter-TV.git}"
BRANCHE="${BRANCHE:-claude/loving-curie-ftnboh}"
ADRESSE="${ADRESSE_PROVISOIRE:-nouveau.swatter-tv.fr}"
COMPTE="${SUDO_USER:-ubuntu}"

etape() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
arret() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
# Remplace (ou ajoute) la ligne CLE=valeur de .env, sans toucher au reste ni aux droits du fichier
regler() {
  local tmp
  tmp="$(mktemp)"
  awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 { print k "=" v; vu = 1; next } { print } END { if (!vu) print k "=" v }' .env > "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

[ "$(id -u)" -eq 0 ] || arret "Lancez l'installation avec sudo."
# Serveur livré avec le seul compte root (sans utilisateur « ubuntu ») : le site lui appartient
getent passwd "$COMPTE" > /dev/null || COMPTE=root
MAISON="$(getent passwd "$COMPTE" | cut -d: -f6)"
[ -n "$MAISON" ] || arret "Compte « $COMPTE » introuvable."
DOSSIER="$MAISON/Swatter-TV"
SITE="$DOSSIER/site"
DEJA=0
[ -f "$SITE/.env" ] && grep -q '^INSTALLATION_TERMINEE=1' "$SITE/.env" && DEJA=1

if [ "$DEJA" -eq 0 ]; then
  etape "Trois questions"
  ADMIN_EMAIL="${ADMIN_EMAIL:-}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
  MOT_DE_PASSE_SITE="${MOT_DE_PASSE_SITE:-}"
  until [[ "$ADMIN_EMAIL" == ?*@?*.?* ]]; do
    read -rp "Votre e-mail (premier compte de l'administration du site) : " ADMIN_EMAIL < /dev/tty
  done
  until [ "${#ADMIN_PASSWORD}" -ge 12 ]; do
    read -rsp "Mot de passe de ce compte (12 caractères au moins) : " ADMIN_PASSWORD < /dev/tty
    echo
  done
  until [ "${#MOT_DE_PASSE_SITE}" -ge 8 ]; do
    read -rsp "Mot de passe provisoire du site, à donner au client (8 caractères au moins) : " MOT_DE_PASSE_SITE < /dev/tty
    echo
  done
  export ADMIN_EMAIL ADMIN_PASSWORD
fi

if [ "${SANS_SYSTEME:-0}" != 1 ]; then
  etape "Mises à jour du système et pare-feu"
  export DEBIAN_FRONTEND=noninteractive
  # Sur un serveur tout juste livré, les mises à jour automatiques tiennent souvent apt : on attend qu'il se libère
  APT=(apt-get -yq -o DPkg::Lock::Timeout=900 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
  "${APT[@]}" update
  "${APT[@]}" upgrade
  "${APT[@]}" install git curl ufw unattended-upgrades
  timedatectl set-timezone Europe/Paris
  ufw allow OpenSSH > /dev/null
  ufw allow 80,443/tcp > /dev/null
  ufw --force enable > /dev/null
  # Moins de 6 Go de mémoire (VPS-1 : 4 Go) : 4 Go d'espace d'échange, la construction du site en demande autant
  if [ "$(awk '/MemTotal/ { print int($2 / 1048576) }' /proc/meminfo)" -lt 6 ] && [ -z "$(swapon --show)" ]; then
    fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile > /dev/null && swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  etape "Docker"
  command -v docker > /dev/null || curl -fsSL https://get.docker.com | sh
  usermod -aG docker "$COMPTE"
fi

etape "Code du site"
if [ -d "$DOSSIER/.git" ]; then
  sudo -u "$COMPTE" git -C "$DOSSIER" pull --ff-only
else
  sudo -u "$COMPTE" git clone --branch "$BRANCHE" "$DEPOT" "$DOSSIER"
fi
cd "$SITE"

etape "Réglages"
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  chown "$COMPTE:" .env
  regler POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  regler PAYLOAD_SECRET "$(openssl rand -hex 32)"
  regler CRON_SECRET "$(openssl rand -hex 32)"
  case "$ADRESSE" in http://* | https://*) regler NEXT_PUBLIC_SITE_URL "$ADRESSE" ;; *) regler NEXT_PUBLIC_SITE_URL "https://$ADRESSE" ;; esac
  regler ADRESSE_PROVISOIRE "$ADRESSE"
  regler CADDY_CONFIG provisoire
  regler COMPOSE_FILE docker-compose.yml:deploy/serveur.yml
fi
if [ -n "${MOT_DE_PASSE_SITE:-}" ]; then
  # Caddy ne garde que l'empreinte du mot de passe ; guillemets simples : les « $ » de l'empreinte restent tels quels
  regler CADDY_MOT_DE_PASSE "'$(docker run --rm caddy:2 caddy hash-password --plaintext "$MOT_DE_PASSE_SITE")'"
fi
URL="$(grep '^NEXT_PUBLIC_SITE_URL=' .env | cut -d= -f2-)"
ADRESSE="$(grep '^ADRESSE_PROVISOIRE=' .env | cut -d= -f2-)"

etape "Construction et démarrage (10 à 15 minutes la première fois)"
# Conteneurs toujours neufs : une installation interrompue peut laisser un conteneur au réseau inutilisable
if [ "${CONSTRUIRE:-1}" = 1 ]; then docker compose up -d --build --force-recreate; else docker compose up -d --no-build --force-recreate; fi
for _ in $(seq 1 60); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)")" = healthy ] && break
  sleep 5
done
[ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)")" = healthy ] ||
  arret "Le site ne démarre pas : voyez « docker compose logs app » (dans $SITE), puis relancez l'installation."

if [ "$DEJA" -eq 0 ]; then
  etape "Premier administrateur et contenus de départ"
  docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD tools npm run payload run src/scripts/init-db.ts
  docker compose run --rm -e SEED_FORCE=1 tools npm run seed
  regler INSTALLATION_TERMINEE 1
fi

etape "Sauvegarde chaque nuit"
install -d -o "$COMPTE" -g "$COMPTE" -m 750 /var/backups/swatter
echo "17 3 * * * $COMPTE $SITE/scripts/sauvegarde.sh >> /var/backups/swatter/sauvegarde.log 2>&1" > /etc/cron.d/swatter-sauvegarde
sudo -u "$COMPTE" "$SITE/scripts/sauvegarde.sh"

IP4="$(ip -4 route get 1.1.1.1 2> /dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1) }')" || IP4=""
IP6="$(ip -6 addr show scope global 2> /dev/null | awk '/inet6/ { sub("/.*", "", $2); print $2; exit }')" || IP6=""
etape "Terminé"
echo "Site : $URL (utilisateur « swatter » et le mot de passe provisoire) ; administration : $URL/admin"
case "$ADRESSE" in
  http://* | https://*) ;;
  *)
    if getent ahostsv4 "$ADRESSE" | grep -qwF "${IP4:-?}"; then
      echo "Le DNS de $ADRESSE pointe déjà vers ce serveur : le certificat HTTPS arrive en quelques minutes."
    else
      echo "En attente du DNS. Le client doit ajouter pour « ${ADRESSE%%.*} » : A ${IP4:-?}${IP6:+ et AAAA $IP6}."
      echo "Une fois fait, si le site ne répond pas au bout de 10 minutes : cd $SITE && docker compose restart caddy"
    fi
    ;;
esac
echo "Pour les commandes suivantes (deploy/emails.sh, deploy/bascule.sh…), déconnectez-vous puis reconnectez-vous."
[ ! -f /var/run/reboot-required ] || echo "Le système demande un redémarrage : sudo reboot (le site repart tout seul)."
