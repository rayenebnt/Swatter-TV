# Mise en ligne de Swatter TV Info

Le client loue un serveur chez OVHcloud et le paie chaque mois ; vous lancez **une commande** dessus. Le site s’ouvre
d’abord sur une adresse provisoire protégée par un mot de passe, `nouveau.swatter-tv.fr`, le temps que le client
remplisse ses contenus ; l’ancien site reste en ligne. Le jour J, une autre commande le passe sur `www.swatter-tv.fr`.

## 1. Le client commande le serveur

Dans un compte OVHcloud au nom de la société : **VPS-1** (ou plus), système **Ubuntu 24.04**, localisation **France**,
option **Sauvegarde automatique**, paiement mensuel avec renouvellement automatique. Il vous transfère ensuite l’e-mail
d’OVHcloud « votre VPS est prêt » : adresse IP, identifiant `ubuntu` et mot de passe.

## 2. Le client ajoute une ligne dans son DNS

Message à lui envoyer (remplacez l’adresse IP par celle de l’e-mail d’OVHcloud) :

> Bonjour, pouvez-vous ajouter dans le DNS de swatter-tv.fr (chez BookMyName, ou dans SiteW si le domaine a été acheté
> avec l’abonnement) un enregistrement **A** : nom `nouveau`, valeur `IP_DU_SERVEUR` ? Ne modifiez aucun autre
> enregistrement, en particulier ceux des e-mails (MX et TXT).

## 3. Vous lancez l’installation

Depuis votre ordinateur, connectez-vous au serveur avec le mot de passe de l’e-mail, puis collez la seconde ligne :

```bash
ssh ubuntu@IP_DU_SERVEUR
curl -fsSL https://raw.githubusercontent.com/rayenebnt/Swatter-TV/claude/loving-curie-ftnboh/site/deploy/installer.sh | sudo bash
```

Trois questions : votre e-mail et votre mot de passe pour l’administration du site, et le mot de passe provisoire à
donner au client. Le reste se fait tout seul (15 à 20 minutes) : sécurité du serveur, Docker, site, contenus de départ,
HTTPS, sauvegarde chaque nuit. À la fin, `https://nouveau.swatter-tv.fr` demande l’utilisateur `swatter` et le mot de
passe provisoire.

Envoyez au client l’adresse et ce mot de passe, puis créez son compte dans l’administration (**Administration** ›
**Utilisateurs**). Il remplace les contenus « Exemple » (GUIDE_CLIENT.md, partie 1).

## 4. Les e-mails du site (avant l’ouverture)

Pour « Mot de passe oublié » et le formulaire de contact, il faut un service d’envoi. Créez un compte **Brevo** au nom
du client et ajoutez-y le domaine `swatter-tv.fr` : Brevo donne quelques enregistrements DNS, que le client **ajoute**
sans toucher aux autres. Puis, sur le serveur (Brevo, rubrique **SMTP & API**, donne l’identifiant et la clé) :

```bash
~/Swatter-TV/site/deploy/emails.sh
```

## 5. Le jour J

Message au client :

> Bonjour, dans le DNS de swatter-tv.fr, pouvez-vous remplacer l’adresse des enregistrements **A** de `www` et de la
> racine (`@`) par `IP_DU_SERVEUR` (si `www` est un CNAME, remplacez-le par un A) ? Ne touchez surtout pas aux
> enregistrements MX et TXT : vos e-mails restent chez SiteW. Ne résiliez pas SiteW avant d’avoir déménagé vos e-mails.

Une fois le changement fait (la commande vérifie le DNS et vous dit d’attendre s’il n’est pas encore visible) :

```bash
~/Swatter-TV/site/deploy/bascule.sh
```

Le site est alors en ligne sur `https://www.swatter-tv.fr`, sans mot de passe ; `swatter-tv.fr` et l’adresse
provisoire y mènent. Déclarez enfin le site dans **Google Search Console** avec le plan du site
`https://www.swatter-tv.fr/sitemap.xml`.

## Au quotidien

| Pour… | Commande, sur le serveur |
|---|---|
| mettre le site à jour (après mes modifications) | `~/Swatter-TV/site/deploy/mise-a-jour.sh` |
| revenir à la sauvegarde d’une date | `~/Swatter-TV/site/deploy/restaurer.sh AAAA-MM-JJ` |
| voir si tout tourne | `cd ~/Swatter-TV/site && docker compose ps` |
| lire les messages d’erreur du site | `cd ~/Swatter-TV/site && docker compose logs app` |

Les sauvegardes se font seules chaque nuit (base et images, 14 jours gardés, dans `/var/backups/swatter`) ; l’option
Sauvegarde automatique d’OVHcloud en garde une copie ailleurs.

## Bon à savoir

- **Mentions légales** : l’hébergeur est OVHcloud ; reprenez ses coordonnées dans ses propres mentions légales.
- **Dépôt GitHub privé** : la commande de l’étape 3 ne peut plus le lire. Donnez d’abord au serveur une clé de
  déploiement (lecture seule), puis lancez l’installation depuis le dossier récupéré :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github -N "" && cat ~/.ssh/github.pub   # → GitHub › Settings › Deploy keys
printf 'Host github.com\n  IdentityFile ~/.ssh/github\n' >> ~/.ssh/config
git clone --branch claude/loving-curie-ftnboh git@github.com:rayenebnt/Swatter-TV.git
sudo bash ~/Swatter-TV/site/deploy/installer.sh
```

- **Ce que fait l’installation** (`deploy/installer.sh`, relançable sans rien écraser) : mises à jour du système et
  pare-feu (SSH, HTTP, HTTPS), Docker, code du site dans `~/Swatter-TV`, réglages dans `~/Swatter-TV/site/.env`
  (secrets tirés au hasard : gardez-en une copie dans un gestionnaire de mots de passe), construction et démarrage, premier
  administrateur, contenus de départ, Caddy (HTTPS, mot de passe provisoire, `deploy/caddy/`), sauvegarde chaque nuit
  (`scripts/sauvegarde.sh`).
