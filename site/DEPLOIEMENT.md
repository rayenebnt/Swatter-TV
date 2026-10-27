# Mise en ligne de Swatter TV Info sur un VPS OVHcloud

Le client commande et paie le serveur ; son prestataire l’installe et l’entretient. Les commandes se tapent sur le serveur,
connecté en SSH, sauf mention contraire. Toute l’installation tient dans `docker-compose.yml` (site, base PostgreSQL,
migrations, import horaire) ; Caddy, installé à côté, gère le HTTPS.

Déroulé : le site est d’abord installé sur une **adresse provisoire protégée par un mot de passe**
(`nouveau.swatter-tv.fr`), le temps que le client remplisse ses contenus, pendant que l’ancien site (SiteW) reste en
ligne. Le jour J, `www.swatter-tv.fr` passe sur le nouveau serveur (partie 11).

**Attention aux e-mails du client** : `contact@swatter-tv.fr` est hébergé chez SiteW (enregistrement MX
`mail.sitew.fr`). Aux deux passages par le DNS, on ne touche qu’aux enregistrements du site, jamais aux MX ni aux TXT
existants, et le client ne résilie pas SiteW avant d’avoir déménagé ses e-mails.

## 1. Le client commande le serveur

Dans un compte OVHcloud **au nom de la société** (c’est lui qui paie, chaque mois) :

1. **VPS** › **VPS-1** (4 vCores, 8 Go de mémoire) ou plus.
2. Système : **Ubuntu 24.04**, sans application préinstallée. Localisation : **France**.
3. Option **Sauvegarde automatique** : conseillée (copie quotidienne de tout le serveur, hors du serveur).
4. Paiement par carte ou prélèvement, **renouvellement automatique actif** (sinon le serveur s’arrête à l’échéance).

## 2. Votre accès au serveur

1. Créez votre propre compte OVHcloud (gratuit) et donnez votre identifiant client (`ab12345-ovh`) au client.
2. Le client vous désigne **contact technique** du VPS (espace client › **Gestion des contacts** ; guide OVHcloud
   « Gérer les contacts de ses services »). Vous voyez alors le VPS dans votre espace ; la facturation reste chez lui.
3. Sur votre ordinateur, une clé SSH si vous n’en avez pas : `ssh-keygen -t ed25519`. La clé publique est
   `~/.ssh/id_ed25519.pub`.
4. Depuis votre espace OVHcloud, fiche du VPS : **Réinstaller mon VPS** › Ubuntu 24.04 › votre clé SSH (le serveur est
   encore vide, rien n’est perdu). À défaut : le mot de passe de l’e-mail d’installation reçu par le client, puis
   `ssh-copy-id ubuntu@IP_DU_SERVEUR` depuis votre ordinateur.

L’adresse IP (et IPv6) du serveur figure sur la fiche du VPS. Connexion : `ssh ubuntu@IP_DU_SERVEUR`.

## 3. Première connexion et sécurité

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades          # mises à jour de sécurité automatiques
sudo timedatectl set-timezone Europe/Paris
# Pare-feu : SSH, HTTP et HTTPS seulement
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable
# Connexion par clé seulement (après avoir vérifié que votre clé fonctionne !)
echo "PasswordAuthentication no" | sudo tee /etc/ssh/sshd_config.d/10-cles-seulement.conf
sudo systemctl reload ssh
sudo reboot                                      # si la mise à jour l’a demandé ; reconnectez-vous ensuite
```

Rien d’autre n’est ouvert : `docker-compose.yml` ne publie le site que sur `127.0.0.1:3000`, et la base nulle part.

Serveur de moins de 8 Go de mémoire seulement (la construction du site en demande environ 4) :

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Docker et le code du site

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit                                             # puis reconnectez-vous : le groupe « docker » s’applique
docker run --rm hello-world                      # vérifie que Docker répond
git clone --branch claude/loving-curie-ftnboh https://github.com/rayenebnt/Swatter-TV.git
cd Swatter-TV/site
```

Si le dépôt GitHub est privé, le serveur s’identifie avec une **clé de déploiement** (lecture seule) :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github-swatter -N "" -C "serveur swatter-tv"
cat ~/.ssh/github-swatter.pub       # à coller dans GitHub › dépôt › Settings › Deploy keys › Add deploy key
printf 'Host github.com\n  IdentityFile ~/.ssh/github-swatter\n' >> ~/.ssh/config
git clone --branch claude/loving-curie-ftnboh git@github.com:rayenebnt/Swatter-TV.git
```

## 5. Configuration, démarrage et premier administrateur

```bash
cp .env.example .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; \
s|^PAYLOAD_SECRET=.*|PAYLOAD_SECRET=$(openssl rand -hex 32)|; \
s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 32)|; \
s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://nouveau.swatter-tv.fr|" .env
chmod 600 .env
nano .env                                        # facultatif : YOUTUBE_API_KEY (toutes les vidéos de la chaîne)
docker compose up -d --build                     # 5 à 10 minutes la première fois
docker compose ps                                # « app » doit passer à « healthy »
```

`NEXT_PUBLIC_SITE_URL` doit être l’adresse par laquelle on ouvre le site, administration comprise : Payload refuse
d’enregistrer depuis une autre adresse. Elle est figée dans l’image : la changer impose `docker compose up -d --build`.
Gardez une copie de `.env` hors du serveur (gestionnaire de mots de passe) : sans `PAYLOAD_SECRET`, les sessions sont
perdues ; sans `POSTGRES_PASSWORD`, la base est inaccessible.

Créez **tout de suite** le premier administrateur (tant qu’aucun compte n’existe, n’importe qui ouvrant `/admin` peut le
créer), puis les contenus de départ « Exemple » que le client remplacera, **une seule fois** (cette commande efface tous
les contenus) :

```bash
read -rsp "Mot de passe du premier administrateur (12 caractères au moins) : " ADMIN_PASSWORD; echo
docker compose run --rm -e ADMIN_EMAIL=vous@exemple.fr -e ADMIN_PASSWORD="$ADMIN_PASSWORD" tools npm run payload run src/scripts/init-db.ts
unset ADMIN_PASSWORD
docker compose run --rm -e SEED_FORCE=1 tools npm run seed
```

## 6. Adresse provisoire protégée par un mot de passe

**Le client** ajoute un enregistrement dans le DNS de `swatter-tv.fr` (chez BookMyName, ou dans SiteW si le domaine a
été acheté avec l’abonnement). Message à lui envoyer :

> Bonjour, pouvez-vous ajouter dans le DNS de swatter-tv.fr un enregistrement **A** : nom `nouveau`, valeur
> `IP_DU_SERVEUR` (et un enregistrement **AAAA** : nom `nouveau`, valeur `IPV6_DU_SERVEUR`) ? Merci de ne modifier
> aucun autre enregistrement, en particulier ceux des e-mails (MX et TXT).

Vérifiez depuis le serveur : `getent hosts nouveau.swatter-tv.fr` doit afficher son adresse. Installez ensuite Caddy
(dépôt officiel) :

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
caddy hash-password                              # tapez deux fois le mot de passe à donner au client
sudo cp deploy/Caddyfile.provisoire /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile                   # remplacez HASH par le résultat de la commande précédente
sudo systemctl reload caddy
```

`https://nouveau.swatter-tv.fr` demande alors l’utilisateur `swatter` et ce mot de passe (le certificat HTTPS arrive
tout seul en quelques secondes), puis affiche le site ; l’administration est sur `/admin`. Envoyez au client l’adresse,
ce mot de passe et son accès à l’administration : il remplit ses contenus (GUIDE_CLIENT.md, partie 1).

## 7. E-mails et comptes de l’équipe

Le site envoie des e-mails (« Mot de passe oublié » de l’équipe et des membres, formulaire « Proposer une info ») : il
lui faut un service d’envoi. Avec **Brevo** (compte au nom du client) :

1. Dans les paramètres de Brevo, rubrique des domaines d’envoi, ajoutez `swatter-tv.fr` : Brevo donne des
   enregistrements DNS (code de vérification, DKIM). Le client les **ajoute** sans toucher aux autres.
2. Rubrique **SMTP & API** : serveur, port, identifiant et clé SMTP (à créer), à reporter dans `.env` :

```bash
nano .env      # SMTP_HOST=smtp-relay.brevo.com, SMTP_PORT=587, SMTP_USER=…, SMTP_PASS=…, SMTP_FROM=contact@swatter-tv.fr
docker compose up -d                             # relance le site avec les nouveaux réglages
docker compose run --rm tools npm run test-email -- vous@exemple.fr
```

Comptes de l’équipe : un administrateur les crée dans **Administration** › **Utilisateurs** (GUIDE_CLIENT.md, partie 19),
un par personne.

## 8. Sauvegardes chaque nuit

`scripts/sauvegarde.sh` enregistre la base et les fichiers envoyés dans `/var/backups/swatter` et garde 14 jours :

```bash
sudo install -d -o ubuntu -g ubuntu -m 750 /var/backups/swatter
./scripts/sauvegarde.sh                          # premier essai : doit finir par « terminé »
echo "17 3 * * * ubuntu $HOME/Swatter-TV/site/scripts/sauvegarde.sh >> /var/backups/swatter/sauvegarde.log 2>&1" | sudo tee /etc/cron.d/swatter-sauvegarde
```

Le lendemain, `tail /var/backups/swatter/sauvegarde.log` doit montrer la sauvegarde de la nuit. Ces fichiers restent sur
le serveur : l’option **Sauvegarde automatique** d’OVHcloud en garde une copie ailleurs. Sans elle, rapatriez-les
régulièrement depuis votre ordinateur : `scp -r ubuntu@IP_DU_SERVEUR:/var/backups/swatter .`

## 9. Mettre à jour le site

```bash
cd ~/Swatter-TV/site
./scripts/sauvegarde.sh                          # par prudence
git pull
docker compose up -d --build                     # les migrations s’appliquent seules (service « migrate »)
docker compose ps
docker image prune -f                            # de temps en temps : supprime les anciennes images
```

## 10. Restaurer une sauvegarde

Remplacez `AAAA-MM-JJ` par la date voulue (`ls /var/backups/swatter`) :

```bash
cd ~/Swatter-TV/site
docker compose stop app cron
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < /var/backups/swatter/swatter-AAAA-MM-JJ.dump
docker run --rm -v swatter-tv_media:/media -v /var/backups/swatter:/sauvegarde:ro alpine:3 \
  tar xzf /sauvegarde/media-AAAA-MM-JJ.tar.gz -C /media
docker compose up -d --force-recreate app cron
```

Les fichiers de la sauvegarde sont remis par-dessus ceux du serveur, sans rien effacer : ceux envoyés depuis restent sur
le disque, inutilisés.

## 11. Jour J : passage sur www.swatter-tv.fr

La veille, le client baisse la durée de cache (TTL) des enregistrements `www` et `@` à 300 secondes, si son interface le
permet. Le jour J :

1. Sauvegarde, puis nouvelle adresse du site, et construction de l’image (le site provisoire continue de tourner) :

```bash
cd ~/Swatter-TV/site
./scripts/sauvegarde.sh
sed -i 's|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://www.swatter-tv.fr|' .env
docker compose build
```

2. **Le client** fait pointer le site vers le serveur. Message à lui envoyer :

> Bonjour, dans le DNS de swatter-tv.fr, pouvez-vous faire pointer le site vers le nouveau serveur : enregistrement
> **A** de `www` et de la racine (`@`) : `IP_DU_SERVEUR` ; **AAAA** de `www` et de `@` : `IPV6_DU_SERVEUR` (supprimez
> l’ancien enregistrement `www`, en A ou en CNAME, qui pointe vers SiteW) ? Ne modifiez surtout pas les enregistrements
> MX et TXT : vos e-mails restent chez SiteW, ne résiliez pas SiteW avant de les avoir déménagés.

3. Dès que `getent hosts www.swatter-tv.fr` affiche l’adresse du serveur :

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
docker compose up -d                             # le site repart avec sa nouvelle adresse
```

4. Vérifiez : `https://www.swatter-tv.fr` s’ouvre sans mot de passe ; `https://swatter-tv.fr` et
   `https://nouveau.swatter-tv.fr` y mènent ; une ancienne adresse (`/Le-Direct`, `/L-info-Haute-Savoie`) mène à la
   bonne page ; connexion à l’administration ; un message du formulaire de contact arrive.
5. **Google Search Console** : ajoutez la propriété `https://www.swatter-tv.fr` et déclarez le sitemap
   `https://www.swatter-tv.fr/sitemap.xml`.

## 12. Surveillance et problèmes fréquents

- Journaux : `docker compose logs -f app` ; import horaire : `docker compose logs cron` ; place disque : `df -h` et
  `docker system df`.
- Une surveillance extérieure (UptimeRobot, Better Stack…) sur `https://www.swatter-tv.fr` prévient si le site tombe.
- **Erreur 502** : le site ne tourne pas → `docker compose ps`, puis `docker compose logs app`.
- **L’administration n’enregistre rien** : `NEXT_PUBLIC_SITE_URL` n’est pas l’adresse utilisée → corriger `.env`, puis
  `docker compose up -d --build`.
- **Certificat HTTPS refusé** : le DNS ne pointe pas encore vers le serveur, ou les ports 80 et 443 sont fermés
  (`sudo ufw status`) ; `sudo journalctl -u caddy` donne la raison.
