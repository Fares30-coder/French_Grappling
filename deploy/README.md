# Déploiement (ADR 0005)

VPS OVH en France, Docker Compose : Caddy (seul service publié) + API + PostgreSQL 17. Ici : la procédure d'installation et de reprise. Les décisions sont dans `docs/adr/0005-hebergement.md`.

Aucun secret dans ce dossier : les valeurs vivent dans `/opt/tatamap/.env` (modèle : `.env.example`), `/etc/tatamap/backup.env` et `/etc/tatamap/rclone.conf` sur le serveur.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `compose.prod.yml` | la pile (`caddy`, `api`, `db`, et `tools` à la demande) ; réseau `back` interne pour la base |
| `compose.local.yml` | surcharge pour essayer la pile en local (images construites au lieu d'être tirées) |
| `Caddyfile`, `caddy/` | proxy, en-têtes, CSP (`csp-strict`, `csp-adsense`), verrou `prelaunch-on` |
| `scripts/tatamap-deploy` | commande forcée de la clé SSH de la CI (refuse tout SHA qui n'est pas un commit de `main`) |
| `scripts/deploy.sh` | pull par empreinte, sauvegarde locale, migrations, redémarrage, test de santé |
| `scripts/backup.sh` | sauvegarde chiffrée (`age`) vers OVH Object Storage |
| `scripts/restore-test.sh` | test de restauration d'un dump nommé, depuis l'ordinateur de Fares |
| `scripts/push-content.sh` | envoie le contenu au serveur et l'importe |

## Essai en local

```sh
cp deploy/.env.example local.env   # ignoré par git (.gitignore) ; remplir : GHCR_OWNER=local, SITE_DOMAIN=localhost,
                                   # ACME_EMAIL, POSTGRES_PASSWORD, JWT_SECRET, WEB_ORIGINS=https://localhost,
                                   # PRELAUNCH=off, WEB_DIGEST=API_DIGEST=TOOLS_DIGEST=sha256:<64 zéros> (valeurs
                                   # factices : la surcharge locale construit les images) ; ajouter VITE_ADSENSE_CLIENT=ca-pub-0000000000000000 pour le profil adsense
docker compose --env-file local.env -f deploy/compose.prod.yml -f deploy/compose.local.yml up -d --build
docker compose --env-file local.env -f deploy/compose.prod.yml -f deploy/compose.local.yml \
  run --rm tools pnpm --filter @tatamap/api exec prisma migrate deploy
```

Caddy utilise sa propre autorité locale pour `localhost` : accepter le certificat (ou `curl -k`).

## Installation du VPS (bootstrap)

1. Debian stable, Docker depuis le dépôt officiel, `ufw` (22/tcp, 80/tcp, 443/tcp, 443/udp), `fail2ban` (jail `sshd`), `unattended-upgrades` avec redémarrage à 04:30. SSH : `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `AllowUsers fares deploy`.
2. Comptes : `fares` (sudo, clé personnelle) ; `deploy` (sans sudo, groupe `docker`).
3. `sudo install -d -o deploy -m 750 /opt/tatamap` puis, en `deploy`, copier `deploy/.env.example` en `/opt/tatamap/.env`, le remplir (`openssl rand -hex 32` pour `POSTGRES_PASSWORD`, `openssl rand -base64 48` pour `JWT_SECRET`, `docker run --rm caddy caddy hash-password` pour `PRELAUNCH_HASH`), `chmod 600`. **Mettre le hash bcrypt entre apostrophes** (`PRELAUNCH_HASH='$2a$14$...'`) : sans elles, `$` est interprété et le hash est cassé. `deploy.sh` refuse de déployer si `PRELAUNCH` n'est pas `off` et que `PRELAUNCH_USER` ou `PRELAUNCH_HASH` est vide.
4. Installer `scripts/tatamap-deploy` en `/usr/local/bin/tatamap-deploy` (root, `chmod 755`) et lier la clé de déploiement dans `~deploy/.ssh/authorized_keys` : `restrict,command="/usr/local/bin/tatamap-deploy" ssh-ed25519 AAAA... tatamap-ci`.
5. Sauvegardes : installer `age` et `rclone`, créer `/etc/tatamap/backup.env` (`AGE_RECIPIENT`, `RCLONE_REMOTE`, `PING_URL`) et `/etc/tatamap/rclone.conf` (`chmod 600`, propriétaire `deploy`), puis un timer systemd quotidien à 03:30 qui lance `deploy/scripts/backup.sh` en `deploy`. Un premier lancement à la main doit afficher `backup done`.
   **Console OVH (à faire par Fares, voir « Sauvegardes : réglages du bucket »)** : clé S3 du serveur en écriture seule, Object Lock ou versioning, règle de cycle de vie à 35 jours.
6. Lancer le workflow GitHub (push sur `main`, ou « Run workflow » avec un SHA) : le premier déploiement tire les images, applique les migrations et démarre la pile.
7. En SSH avec `fares`, dans `/opt/tatamap/repo` (`.env` est en `600` au nom de `deploy`, d'où `sudo -u deploy`) : `sudo -u deploy docker compose --env-file ../.env -f deploy/compose.prod.yml run --rm api node dist/create-admin.js <email>` (une fois ; la saisie du mot de passe reste interactive, ajouter `-it` si besoin).
8. Depuis l'ordinateur de Fares : `DEPLOY_TARGET=fares@<hôte> deploy/scripts/push-content.sh <clone de tatamap-content>`.
9. Premier test de restauration (`scripts/restore-test.sh`), puis noter la date ci-dessous.
10. Ouverture : après l'audit, `PRELAUNCH=off` dans `.env` et `docker compose ... up -d caddy`. CSP : commencer avec `CSP_HEADER=Content-Security-Policy-Report-Only` pendant deux semaines, puis `Content-Security-Policy`.

Le profil CSP (`CSP_PROFILE`) et les variables `VITE_*` vont ensemble : `adsense` avec `VITE_ADSENSE_CLIENT` renseigné, `strict` sans. Un changement de `VITE_*` demande un nouveau build (variables du dépôt GitHub : `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT_RAIL`, `VITE_LEGAL_NAME`, `VITE_LEGAL_STATUS`, `VITE_LEGAL_SIRET`, `VITE_LEGAL_ADDRESS`, `VITE_LEGAL_EMAIL`, `VITE_LEGAL_DIRECTOR`). Tant que les `VITE_LEGAL_*` sont vides, les pages légales affichent « À COMPLÉTER ».

## Retour arrière

GitHub, onglet Actions, « CI », « Run workflow » avec le SHA précédent. Les images sont tirées **par empreinte** (`@sha256:...`), pas par tag : à chaque déploiement réussi, `deploy.sh` ajoute `<sha> <web> <api> <tools>` à `/opt/tatamap/releases.log`, et un retour arrière (SHA seul) relit les empreintes dans ce fichier. On ne peut donc revenir qu'à une version déjà déployée sur ce serveur (sinon : refus clair) ; pour une version jamais déployée, relancer un déploiement normal depuis `main`. Le SHA doit être un commit de `main` (vérifié par la CI puis par le serveur). Les migrations ne reviennent pas en arrière : elles doivent rester compatibles avec la version précédente du code.

## Reprise après sinistre (cible : moins d'une heure)

1. Nouveau VPS, bootstrap (ci-dessus, étapes 1 à 5), DNS vers la nouvelle adresse.
2. Choisir **un dump précis** (`rclone lsf`, date attendue ; avec le versioning, une version antérieure à l'incident), le récupérer (`rclone copyto`), le déchiffrer (`age -d -i <clé privée>`), démarrer `db` (`docker compose ... up -d --wait db`), restaurer : `docker compose ... exec -T db pg_restore -U tatamap -d tatamap --clean --if-exists --no-owner < db.dump`.
3. Relancer le déploiement du SHA en cours (workflow avec SHA).
4. En dernier recours : migrations, `push-content.sh` et `create-admin.js` reconstruisent le site publié.

## Sauvegardes : réglages du bucket (console OVH, à faire par Fares)

Le serveur ne doit pas pouvoir réécrire l'historique de ses sauvegardes :

1. Utilisateur Object Storage du serveur : droits **écriture seule** sur le bucket (`PutObject`, pas de `DeleteObject`, pas de lecture ni de liste si possible). `backup.sh` ne fait plus que `rclone copy` et ne supprime rien.
2. **Object Lock** (rétention 35 jours, mode conformité) ou, à défaut, **versioning** activé sur le bucket : un objet remplacé ou supprimé reste récupérable.
3. **Règle de cycle de vie** du bucket : expiration à 35 jours (versions non courantes comprises). C'est elle, et non le serveur, qui fait la rétention.
4. Une seconde clé, en lecture seule, sur l'ordinateur de Fares pour `restore-test.sh`.

Tant que 1 à 3 ne sont pas faits, un serveur compromis peut détruire ou remplacer ses sauvegardes (ADR 0005 D7).

## Dernier test de restauration

Jamais (à faire à l'installation, puis chaque trimestre).
