# Déploiement (ADR 0005)

VPS OVH en France, Docker Compose : Caddy (seul service publié) + API + PostgreSQL 17. Ici : la procédure d'installation et de reprise. Les décisions sont dans `docs/adr/0005-hebergement.md`.

Aucun secret dans ce dossier : les valeurs vivent dans `/opt/tatamap/.env` (modèle : `.env.example`), `/etc/tatamap/backup.env` et `/etc/tatamap/rclone.conf` sur le serveur.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `compose.prod.yml` | la pile (`caddy`, `api`, `db`, et `tools` à la demande) ; réseau `back` interne pour la base |
| `compose.local.yml` | surcharge pour essayer la pile en local (images construites au lieu d'être tirées) |
| `Caddyfile`, `caddy/` | proxy, en-têtes, CSP (`csp-strict`, `csp-adsense`), verrou `prelaunch-on` |
| `scripts/tatamap-deploy` | commande forcée de la clé SSH de la CI |
| `scripts/deploy.sh` | pull, sauvegarde locale, migrations, redémarrage, test de santé |
| `scripts/backup.sh` | sauvegarde chiffrée (`age`) vers OVH Object Storage |
| `scripts/restore-test.sh` | test de restauration, depuis l'ordinateur de Fares |
| `scripts/push-content.sh` | envoie le contenu au serveur et l'importe |

## Essai en local

```sh
cp deploy/.env.example local.env   # ignoré par git ; remplir : GHCR_OWNER=local, TAG=dev, SITE_DOMAIN=localhost,
                                   # ACME_EMAIL, POSTGRES_PASSWORD, JWT_SECRET, WEB_ORIGINS=https://localhost,
                                   # PRELAUNCH=off ; ajouter VITE_ADSENSE_CLIENT=ca-pub-0000000000000000 pour le profil adsense
docker compose --env-file local.env -f deploy/compose.prod.yml -f deploy/compose.local.yml up -d --build
docker compose --env-file local.env -f deploy/compose.prod.yml -f deploy/compose.local.yml \
  run --rm tools pnpm --filter @tatamap/api exec prisma migrate deploy
```

Caddy utilise sa propre autorité locale pour `localhost` : accepter le certificat (ou `curl -k`).

## Installation du VPS (bootstrap)

1. Debian stable, Docker depuis le dépôt officiel, `ufw` (22/tcp, 80/tcp, 443/tcp, 443/udp), `fail2ban` (jail `sshd`), `unattended-upgrades` avec redémarrage à 04:30. SSH : `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `AllowUsers fares deploy`.
2. Comptes : `fares` (sudo, clé personnelle) ; `deploy` (sans sudo, groupe `docker`).
3. `sudo install -d -o deploy -m 750 /opt/tatamap` puis, en `deploy`, copier `deploy/.env.example` en `/opt/tatamap/.env`, le remplir (`openssl rand -hex 32` pour `POSTGRES_PASSWORD`, `openssl rand -base64 48` pour `JWT_SECRET`, `docker run --rm caddy caddy hash-password` pour `PRELAUNCH_HASH`), `chmod 600`.
4. Installer `scripts/tatamap-deploy` en `/usr/local/bin/tatamap-deploy` (root, `chmod 755`) et lier la clé de déploiement dans `~deploy/.ssh/authorized_keys` : `restrict,command="/usr/local/bin/tatamap-deploy" ssh-ed25519 AAAA... tatamap-ci`.
5. Sauvegardes : installer `age` et `rclone`, créer `/etc/tatamap/backup.env` (`AGE_RECIPIENT`, `RCLONE_REMOTE`, `PING_URL`) et `/etc/tatamap/rclone.conf` (`chmod 600`, propriétaire `deploy`), puis un timer systemd quotidien à 03:30 qui lance `deploy/scripts/backup.sh` en `deploy`. Un premier lancement à la main doit afficher `backup done`.
6. Lancer le workflow GitHub (push sur `main`, ou « Run workflow » avec un SHA) : le premier déploiement tire les images, applique les migrations et démarre la pile.
7. En SSH avec `fares`, dans `/opt/tatamap/repo` : `docker compose --env-file ../.env -f deploy/compose.prod.yml run --rm api node dist/create-admin.js <email>` (une fois).
8. Depuis l'ordinateur de Fares : `DEPLOY_TARGET=fares@<hôte> deploy/scripts/push-content.sh <clone de tatamap-content>`.
9. Premier test de restauration (`scripts/restore-test.sh`), puis noter la date ci-dessous.
10. Ouverture : après l'audit, `PRELAUNCH=off` dans `.env` et `docker compose ... up -d caddy`. CSP : commencer avec `CSP_HEADER=Content-Security-Policy-Report-Only` pendant deux semaines, puis `Content-Security-Policy`.

Le profil CSP (`CSP_PROFILE`) et les variables `VITE_*` vont ensemble : `adsense` avec `VITE_ADSENSE_CLIENT` renseigné, `strict` sans. Un changement de `VITE_*` demande un nouveau build (variables du dépôt GitHub : `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT_RAIL`, `VITE_LEGAL_NAME`, `VITE_LEGAL_STATUS`, `VITE_LEGAL_SIRET`, `VITE_LEGAL_ADDRESS`, `VITE_LEGAL_EMAIL`, `VITE_LEGAL_DIRECTOR`). Tant que les `VITE_LEGAL_*` sont vides, les pages légales affichent « À COMPLÉTER ».

## Retour arrière

GitHub, onglet Actions, « CI », « Run workflow » avec le SHA précédent (ses images existent déjà). Les migrations ne reviennent pas en arrière : elles doivent rester compatibles avec la version précédente du code.

## Reprise après sinistre (cible : moins d'une heure)

1. Nouveau VPS, bootstrap (ci-dessus, étapes 1 à 5), DNS vers la nouvelle adresse.
2. Récupérer le dernier dump (`rclone copy`), le déchiffrer (`age -d -i <clé privée>`), démarrer `db` (`docker compose ... up -d --wait db`), restaurer : `docker compose ... exec -T db pg_restore -U tatamap -d tatamap --clean --if-exists --no-owner < db.dump`.
3. Relancer le déploiement du SHA en cours (workflow avec SHA).
4. En dernier recours : migrations, `push-content.sh` et `create-admin.js` reconstruisent le site publié.

## Dernier test de restauration

Jamais (à faire à l'installation, puis chaque trimestre).
