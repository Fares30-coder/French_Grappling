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
| `scripts/bootstrap-vps.sh` | installation et durcissement d'un VPS Debian neuf (étapes 1 à 5 ci-dessous) |

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

Les étapes 1 à 5 sont faites par `scripts/bootstrap-vps.sh` (relançable sans risque), répété sur une VM Debian 13 le 2026-11-24 :

```sh
scp deploy/scripts/{bootstrap-vps.sh,tatamap-deploy} <premier utilisateur>@<hôte>:
ssh <premier utilisateur>@<hôte> sudo ADMIN_KEY="$(cat ~/.ssh/id_ed25519.pub)" CI_KEY="<clé publique de la CI>" bash bootstrap-vps.sh
```

Garder cette session ouverte tant que `ssh fares@<hôte>` ne marche pas depuis un autre terminal : le script ferme SSH à `fares` et `deploy`, par clé seulement. Puis `sudo passwd fares` (mot de passe de `sudo`, jamais utilisé par SSH).

1. Ce que fait le script : Docker depuis le dépôt officiel, `ufw` (22/tcp, 80/tcp, 443/tcp, 443/udp), `fail2ban` (jail `sshd`, journal systemd), `unattended-upgrades` avec redémarrage à 04:30, SSH : `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `AllowUsers fares deploy`.
2. Comptes : `fares` (sudo, clé personnelle) ; `deploy` (sans sudo, groupe `docker`), avec la clé de la CI derrière la commande forcée **et** la clé personnelle de Fares, sans restriction : `push-content.sh` et `create-admin.js` passent par `deploy`, propriétaire de `/opt/tatamap` (le groupe `docker` vaut déjà root, la clé ne donne rien de plus que `sudo`).
3. `/opt/tatamap/.env` créé une seule fois avec `POSTGRES_PASSWORD` et `JWT_SECRET` générés. À compléter en `deploy` : `ACME_EMAIL`, `PRELAUNCH_USER`, `PRELAUNCH_HASH` (`docker run --rm caddy:2.11-alpine caddy hash-password`). **Mettre le hash bcrypt entre apostrophes** (`PRELAUNCH_HASH='$2a$14$...'`) : sans elles, `$` est interprété et le hash est cassé. `deploy.sh` refuse de déployer si `PRELAUNCH` n'est pas `off` et que `PRELAUNCH_USER` ou `PRELAUNCH_HASH` est vide.
4. `tatamap-deploy` installé en `/usr/local/bin/tatamap-deploy` et lié à la clé de la CI : `restrict,command="/usr/local/bin/tatamap-deploy" ssh-ed25519 AAAA... tatamap-ci`.
5. Sauvegardes : `age` et `rclone` installés, `/etc/tatamap/backup.env` et `/etc/tatamap/rclone.conf` créés vides (`600`, propriétaire `deploy`), timer systemd `tatamap-backup.timer` à 03:30. **À remplir** : `AGE_RECIPIENT`, `RCLONE_REMOTE`, `PING_URL` et la clé S3, puis un premier lancement à la main (`/opt/tatamap/repo/deploy/scripts/backup.sh` en `deploy`, après le premier déploiement) doit afficher `backup done`.
   **Console OVH (à faire par Fares, voir « Sauvegardes : réglages du bucket »)** : clé S3 du serveur en écriture seule, Object Lock ou versioning, règle de cycle de vie à 35 jours.
6. GitHub : secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` dans l'environnement `production`, puis la variable de dépôt `DEPLOY_ENABLED=true` (sans elle, le job `deploy` est sauté). Lancer le workflow (push sur `main`, ou « Run workflow » avec un SHA) : le premier déploiement tire les images, applique les migrations et démarre la pile.
7. Compte admin, une fois, depuis l'ordinateur de Fares : `ssh -t deploy@<hôte> 'cd /opt/tatamap/repo && docker compose --env-file ../.env -f deploy/compose.prod.yml run --rm api node dist/create-admin.js <email>'` (le mot de passe est saisi deux fois, sans écho).
8. Contenu : `DEPLOY_TARGET=deploy@<hôte> deploy/scripts/push-content.sh <clone de tatamap-content>`.
9. Premier test de restauration (`scripts/restore-test.sh`, sur l'ordinateur de Fares : `brew install age rclone`, base locale démarrée par `pnpm db:up`), puis noter la date ci-dessous. Il échoue si le contenu restauré diffère du clone de `tatamap-content` (comparaison du fond : nombres, ordre des clés et des enchaînements normalisés).
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
