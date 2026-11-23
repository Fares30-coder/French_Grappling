# ADR 0005 — Hébergement et mise en ligne

- Statut : accepté (validé par Fares le 2026-11-23)
- Date : 2026-11-23
- Auteur : agent architecte (pour Fares Haouari)
- Portée : phase 3, lot 8 (`docs/plan-phase-3.md`)
- Dépend de : ADR 0003 (B6 même origine, B7 durcissement, B8 variables d'environnement, CSP du front chez l'hébergeur)
- Remplace : la phrase « Netlify `_redirects` / Vercel `rewrites` vers Render/Railway » d'ADR 0003 B6 (le principe de même origine reste)

## Contexte

Le lot 8 met `https://tatamap.fr` en ligne : front (build Vite), API Fastify, PostgreSQL, compte admin, contenu importé depuis le repo privé, en-têtes de sécurité, audit avant ouverture. Fares a choisi **OVH** comme hébergeur et comme registrar de `tatamap.fr`.

État réel du code (vérifié le 2026-11-23) :

- L'API lit `NODE_ENV`, `DATABASE_URL`, `PORT`, `HOST` (défaut `127.0.0.1`), `LOG_LEVEL`, `JWT_SECRET` (≥ 32 octets), `WEB_ORIGINS` (https obligatoire en prod), `COOKIE_SECURE` (`false` refusé en prod ; cookie `__Host-tatamap_session` quand `true`), `TRUST_PROXY` (0 à 5) (`apps/api/src/env.ts`).
- L'API pose déjà ses en-têtes (helmet) : CSP `default-src 'none'; frame-ancestors 'none'`, HSTS par défaut d'helmet (un an, `includeSubDomains`, avec un `TODO(phase 3)`), CORP `same-site`, `Cache-Control: no-store` sur l'admin. La CSP du **front** reste à faire.
- `GET /api/health` existe. Le rate-limit du login dépend de `TRUST_PROXY`.
- Le build de l'API (`tsdown`) produit `dist/server.js` et `dist/create-admin.js`. `content:import` et `db:migrate-poses` sont des scripts `tsx` (non bundlés) ; `prisma` (CLI, nécessaire à `migrate deploy`) est une dépendance de dev.
- Le front : pas de service worker (PWA retirée le 2026-11-23 : une app mobile prendra le hors ligne en charge). Le modèle `fighter.v3.glb` est chargé **sans Draco** (pas de CDN). Pas de script inline dans `index.html`. `ads.txt` est émis au build si `VITE_ADSENSE_CLIENT` est défini ; `features/ads/adsense.ts` injecte alors `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js`.
- La CI (`.github/workflows/ci.yml`) : lint, typecheck, `migrate deploy` sur une base jetable, tests, build. Pas de déploiement.
- `docker-compose.yml` : PostgreSQL 17 local, port publié sur `127.0.0.1` seulement.

Contraintes : projet solo, quelques visiteurs (2 ou 3 clubs testeurs), budget minimal, peu de temps d'exploitation, données en France (RGPD, et argument de vente « site français »). Le repo est public : aucun secret, IP ni identifiant réel ici.

## Offres OVH vérifiées (2026-11-23)

| Offre | Ce qui a pu être vérifié | Source |
| --- | --- | --- |
| VPS-1 (gamme « VPS 2027 ») | 2 vCores, 4 Go de RAM, 40 Go NVMe, sauvegarde automatique d'un jour incluse ; **à partir de 3,81 € HT / 4,57 € TTC par mois** | [ovhcloud.com/fr/vps](https://www.ovhcloud.com/fr/vps/) (via résultats de recherche ; tableau non lisible en direct) |
| VPS-2 / VPS-3 | 4 vCores / 8 Go : à partir de 7,21 € HT (8,65 € TTC) ; 6 vCores / 12 Go : à partir de 10,40 € HT (12,48 € TTC) | idem |
| PostgreSQL managé (Public Cloud Databases) | Facturation horaire × 730 h. Plus petit plan trouvé : Essential `db1-4` (2 vCPU, 4 Go, 50 Go) à **0,086 $/h, soit environ 63 $/mois** (calcul), d'après un agrégateur tiers ; non confirmé sur le site d'OVH. Les nouveaux plans Discovery / Production / Advanced n'ont pas pu être chiffrés. | [docs OVH, pricing](https://docs.ovhcloud.com/en/guides/public-cloud/databases/pricing), [Spare Cores db1-4](https://sparecores.com/database/ovh/postgresql-essential-db1-4) |
| Object Storage (S3) | Compatible S3 ; **pas de frais de trafic sortant ni entrant ni d'appels d'API** ; 200 € de crédits à l'ouverture d'un compte Public Cloud. **Prix au Go/mois non vérifié** (le tableau de prix ne s'est pas chargé) : à lire dans le configurateur. Pour quelques Mo de sauvegardes, la somme est de toute façon négligeable. | [ovhcloud.com/fr/public-cloud/object-storage](https://www.ovhcloud.com/fr/public-cloud/object-storage/) |
| Domaine `.fr` | Prix non vérifié (quelques euros par an) | à lire à la commande |

Pour référence : Railway a un plan Hobby à 5 $/mois minimum d'usage ; Render a changé ses formules le 2026-04-23 (offres d'espace de travail plus un prix par service) et les prix d'un service web + PostgreSQL n'ont pas pu être confirmés ([Render, blog](https://render.com/blog/better-pricing-for-fast-growing-teams), [comparatif Encore](https://encore.dev/articles/render-vs-railway)).

AdSense et CSP : Google ne prend en charge qu'une CSP **stricte à nonce** (`'strict-dynamic'`), et recommande de tester d'abord en `Content-Security-Policy-Report-Only` ([AdSense, aide](https://support.google.com/adsense/answer/16283098)).

## Options comparées

1. **OVH VPS tout-en-un (Docker Compose : Caddy + API + PostgreSQL)** : environ 4,6 € TTC/mois. Même origine native (un seul reverse proxy), TLS automatique, données en France. À notre charge : mises à jour de l'OS, sauvegardes, surveillance. Un seul point de panne, acceptable pour des clubs testeurs.
2. **OVH VPS + PostgreSQL managé** : sauvegardes et mises à jour de la base gérées, mais au moins ~60 $/mois pour le plus petit plan trouvé, soit plus de dix fois le VPS pour une base de quelques Mo, et un aller-retour réseau en plus. Disproportionné tant qu'il n'y a pas de revenus.
3. **Render / Railway (+ Vercel / Netlify pour le front)** : rien à administrer, mais deux ou trois fournisseurs américains, une réécriture `/api/*` à configurer chez le fournisseur du front, un nombre de proxys à mesurer, des prix qui ont bougé en 2026. Écarté par le choix d'OVH ; reste le repli si l'administration du VPS devient pénible.

## Décision

**Option 1 : un VPS-1 OVH en France, Docker Compose avec Caddy, l'API et PostgreSQL 17, sauvegardes chiffrées quotidiennes sur OVH Object Storage dans une autre région.** Coût estimé : **environ 5 € TTC par mois** (VPS-1 4,57 € + stockage objet de l'ordre du centime), plus le domaine à l'année.

On passe au VPS-2 si la RAM manque (redimensionnement), et à une base managée seulement quand des clubs paieront (dump / restauration, rien à réécrire).

### D1. Topologie

```
Internet ──443/80──> caddy (seul service publié)
                       ├─ /api/*  → reverse_proxy api:3000   (réseau Docker interne)
                       └─ /*      → fichiers du front (/srv), repli SPA sur /index.html
                     api ──> db:5432 (réseau interne, jamais publié)
```

- **Même origine** : `https://tatamap.fr` sert le front et `/api/*` (ADR 0003 B6). `www.tatamap.fr` redirige en 301 vers `tatamap.fr`. Pas de `api.tatamap.fr`, pas de CORS.
- **TLS automatique** : Caddy obtient et renouvelle les certificats Let's Encrypt ; HTTP → HTTPS automatique. Volume `caddy_data` persistant (certificats).
- **Ports** : seul `caddy` a des `ports:` (80, 443, 443/udp pour HTTP/3). `api` et `db` n'en ont **jamais** : Docker contourne le pare-feu de l'hôte pour les ports publiés, c'est donc la vraie barrière.
- **API** : `HOST=0.0.0.0` (écoute sur le réseau du conteneur, non publié), `PORT=3000`, `TRUST_PROXY=1` (Caddy est le seul proxy ; il remplace un `X-Forwarded-For` venant d'un client non fiable). À vérifier une fois en ligne : l'IP loggée au login est bien celle du client.
- **Conteneurs** : `restart: unless-stopped`, healthchecks (`pg_isready`, `GET /api/health`), journaux Docker `json-file` limités (`max-size: 10m`, `max-file: 3`).

### D2. Images et fichiers de déploiement

Un `Dockerfile` à la racine, multi-étapes, trois cibles, construites par la CI et poussées sur **GHCR** (`ghcr.io/<owner>/tatamap-{web,api,tools}:<sha>`, paquets publics : le code l'est déjà et les images ne contiennent ni secret ni contenu) :

| Cible | Contenu | Usage |
| --- | --- | --- |
| `web` | `caddy` (image officielle, version épinglée) + `Caddyfile` + `apps/web/dist` | le reverse proxy et le front |
| `api` | Node 24 slim, `pnpm deploy --prod` de `@tatamap/api`, `dist/`, utilisateur non root | `node dist/server.js` ; `node dist/create-admin.js` |
| `tools` | workspace complet avec dépendances de dev (prisma CLI, tsx) | `prisma migrate deploy`, `content:import`, `db:migrate-poses` |

Le front est donc **servi par Caddy** comme fichiers statiques, construits dans la CI avec les variables publiques `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT_RAIL` (variables d'Actions, pas des secrets ; vides = pas de pub). La cible `tools` évite de déplacer `prisma` en dépendance de prod et d'ajouter des entrées tsdown.

`.dockerignore` : `content/`, `.env*`, `node_modules`, `.git`, `tools/blender`, sorties de rendu. Un test de la CI vérifie qu'aucun fichier de `content/` n'entre dans une image (le build ne doit pas dépendre de sa présence).

Fichiers versionnés dans `deploy/` (aucun secret) :

- `deploy/compose.prod.yml` : services `caddy` (image `web`), `api`, `db` (`postgres:17-alpine`, volume `pgdata`), et `tools` sous le profil `tools` (lancé à la demande).
- `deploy/Caddyfile` et `deploy/caddy/csp-strict.caddy`, `deploy/caddy/csp-adsense.caddy`.
- `deploy/scripts/deploy.sh`, `backup.sh`, `restore-test.sh`, `push-content.sh`.
- `deploy/.env.example` (noms des variables, valeurs vides).
- `deploy/README.md` : la procédure d'installation (bootstrap) et de reprise après sinistre, courte.

Esquisse du `Caddyfile` (à valider par `dev` avec `curl -I`, sans en-tête doublé) :

```caddyfile
{
	email {$ACME_EMAIL}
}

www.{$SITE_DOMAIN} {
	redir https://{$SITE_DOMAIN}{uri} permanent
}

{$SITE_DOMAIN} {
	encode zstd gzip
	import prelaunch-{$PRELAUNCH:off}.caddy
	header >Strict-Transport-Security "max-age=31536000; includeSubDomains"
	header X-Content-Type-Options nosniff
	header Referrer-Policy strict-origin-when-cross-origin
	header -Server

	handle /api/* {
		reverse_proxy api:3000
	}

	handle {
		import csp-{$CSP_PROFILE:strict}.caddy
		header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
		@hashed path /assets/*
		header @hashed Cache-Control "public, max-age=31536000, immutable"
		@other not path /assets/*
		header @other Cache-Control "no-cache"
		root * /srv
		try_files {path} /index.html
		file_server
	}
}
```

`prelaunch-on.caddy` met un `basic_auth` sur tout le site tant que l'audit cybersécurité n'est pas passé (le plan veut que le site ne soit montré à personne avant la fin du lot 8) ; `prelaunch-off.caddy` est vide.

### D3. En-têtes

- **CSP du front** (profil `strict`, par défaut) :

  ```
  default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
  font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self';
  object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none';
  upgrade-insecure-requests
  ```

  `blob:` pour les textures que `GLTFLoader` décode ; pas d'`unsafe-eval` (Three.js n'en a pas besoin, ADR 0003 B7). Si une bibliothèque injecte des balises `<style>`, on accepte `style-src 'self' 'unsafe-inline'` (risque faible) plutôt que de la retirer. Les images de sponsors sont auto-hébergées (`public/sponsors/`), jamais des URL tierces.
- **Profil `adsense`** (retenu au lancement, décision de Fares du 2026-11-23 : le projet doit rapporter dès l'ouverture) : CSP **stricte à nonce**, la seule que Google prend en charge. Sans service worker, `index.html` n'est plus précaché : un nonce neuf par requête devient possible sans faire servir la page par l'API.
  - Build : `html.cspNonce` de Vite pose un nonce fictif (`__CSP_NONCE__`) sur les balises `<script>` et `<style>` générées.
  - Caddy : `index.html` passe par la directive `templates`, qui remplace le fictif par `{http.request.uuid}` ; le même placeholder alimente l'en-tête.
  - En-tête (recommandation Google) : `script-src 'nonce-{http.request.uuid}' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'` (les deux derniers mots-clés ne servent qu'aux vieux navigateurs, ignorés dès que `strict-dynamic` est compris), plus `frame-ancestors 'none'` et `form-action 'self'`. Pas de restriction sur `img-src`, `frame-src`, `connect-src` : AdSense en a besoin.
  - `adsense.ts` crée la balise `adsbygoogle.js` depuis un script de confiance : `strict-dynamic` l'autorise sans nonce ; le chunk 3D chargé par `import()` aussi.
  - **À vérifier dans le lot 8** avant de s'y fier : que `{http.request.uuid}` vaut bien la même chose dans le corps et l'en-tête d'une requête, et que `html.cspNonce` couvre toutes les balises du build. Déploiement d'abord deux semaines en `Content-Security-Policy-Report-Only`. Repli si ça coince : la liste d'origines Google (`script-src 'self'` + `pagead2.googlesyndication.com`, `*.googlesyndication.com`, `*.adtrafficquality.google`, `fundingchoicesmessages.google.com`), non garantie par Google.
  - Le profil se choisit par `CSP_PROFILE` dans le `.env` du serveur, en même temps qu'un build avec `VITE_ADSENSE_CLIENT`.
- **API** : garde sa CSP `default-src 'none'` (Caddy n'en pose pas sur `/api/*`). HSTS : Caddy le pose (`>` = après la réponse de l'API, en remplacement) ; helmet garde la même valeur, le `TODO(phase 3)` d'`app.ts` est levé : `includeSubDomains` oui (seul `www` existe, redirigé), `preload` non pour l'instant.
- **`COOKIE_SECURE=true`** et `NODE_ENV=production` : l'API refuse déjà de démarrer autrement.
- **Cache** : `/assets/*` (noms hachés) immutable un an ; tout le reste (`index.html`, `ads.txt`, `.glb`) en `no-cache`. Changer de profil CSP implique un nouveau build.

### D4. Déploiement depuis GitHub Actions

- `ci.yml` garde le job `check`. Deux jobs s'ajoutent, seulement sur `push` vers `main` : `images` (`needs: check`, `permissions: packages: write`, build et push des trois cibles taguées par `github.sha`) puis `deploy` (`needs: images`). Les trois `build-push` exposent leur **empreinte** (`digest`) en sorties du job. Actions épinglées par SHA, comme l'existant. Un `workflow_dispatch` avec un `sha` en entrée sert au retour arrière.
- `deploy` tourne dans l'**environnement GitHub `production`**, limité à la branche `main`, qui porte les seuls secrets de déploiement : `DEPLOY_SSH_KEY` (clé ed25519 **dédiée**, sans phrase de passe, générée pour ça seulement), `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` (empreinte de l'hôte, pas de `ssh-keyscan` à la volée). **Aucun secret applicatif dans GitHub** (`JWT_SECRET`, mot de passe de la base, clés S3 restent sur le serveur).
- Sur le VPS, la clé est attachée à l'utilisateur `deploy` avec une **commande forcée** dans `authorized_keys` : `restrict,command="/usr/local/bin/tatamap-deploy"`. Ce script (installé une fois par Fares) n'accepte que `<sha> <digest web> <digest api> <digest tools>` (SHA de 40 hexadécimaux, empreintes `sha256:[0-9a-f]{64}`) ou un SHA seul (retour arrière), met à jour un clone **public** du repo (`git fetch`, sans identifiant), **refuse tout SHA qui n'est pas un ancêtre de `origin/main`** (`git merge-base --is-ancestor`, sinon le `deploy.sh` d'une branche quelconque tournerait en `deploy`), fait le `checkout` et lance `deploy/scripts/deploy.sh` avec les mêmes arguments. Le job `deploy` fait la même vérification avant le `ssh` (checkout complet) :
  1. `docker compose pull` des images **par empreinte** (`image: ...@${WEB_DIGEST}`), pas par tag : un tag GHCR est réécrivable par quiconque peut pousser un paquet du dépôt, une empreinte non ;
  2. sauvegarde locale rapide (`backup.sh --local-only`, la base fait quelques Mo) ;
  3. `docker compose run --rm tools pnpm --filter @tatamap/api exec prisma migrate deploy` ; en cas d'échec, arrêt sans toucher aux conteneurs en service ;
  4. `docker compose up -d --remove-orphans` sur ces empreintes ;
  5. attente de `GET /api/health` via Caddy (échec = job rouge) ; `docker image prune -f`.
- `deploy` est dans le groupe `docker`, donc équivalent root s'il pouvait lancer n'importe quoi : la commande forcée est la protection. Le job ne peut rien faire d'autre que déployer un commit de `main` (contrôle d'ascendance côté CI **et** côté serveur : la restriction de l'environnement `production` à `main` porte sur la branche du workflow, pas sur l'entrée `sha`). En cas d'échec du test de santé, `deploy.sh` n'imprime que `compose ps` : les journaux des conteneurs (IP des visiteurs, URL) restent sur le serveur, la sortie de la commande forcée finissant dans un journal Actions public.
- **Retour arrière** : relancer le workflow avec le SHA précédent. Les empreintes d'un SHA viennent de `/opt/tatamap/releases.log`, que `deploy.sh` alimente à chaque déploiement réussi : un retour arrière ne résout jamais un tag, mais ne peut viser qu'une version déjà déployée sur ce serveur (pour une autre, redéployer depuis `main`). Compromis assumé : le fichier est sur le serveur (un attaquant qui y écrit est déjà `deploy`, équivalent root). Alternative écartée, plus lourde : attestations de provenance (`attest-build-provenance` + `gh attestation verify`). Les migrations ne reviennent pas en arrière : règle pour `dev`, une migration doit rester compatible avec la version précédente du code (ajouter, puis retirer dans une migration suivante).
- Jamais de `db:seed` en prod.

### D5. Opérations manuelles en prod

Faites par Fares en SSH avec **son** compte (pas `deploy`), dans `/opt/tatamap` :

- **Compte admin** : `docker compose run --rm api node dist/create-admin.js` (saisie masquée, interactive). Une fois.
- **Contenu** : il ne transite jamais par GitHub ni par une image. Depuis son ordinateur, `deploy/scripts/push-content.sh` envoie par `rsync` (SSH) les seuls dossiers de contenu du site (techniques, positions, tags ; pas `marketing/`, pas `.git`) de son clone local de `tatamap-content` vers `/opt/tatamap/content` sur le VPS, puis lance `docker compose run --rm -v /opt/tatamap/content:/content:ro -e CONTENT_DIR=/content tools pnpm content:import`. L'import valide tout avant d'écrire et fait un upsert par slug (relançable). Aucune clé d'accès au repo privé sur le serveur.
- **Migration de poses** (nouveau squelette, ADR 0002 D6) : `docker compose run --rm tools pnpm db:migrate-poses`, après le déploiement du code qui sait lire le nouveau format.
- **Inversement** : le contenu modifié dans l'éditeur en prod se récupère avec `content:export` (même mécanisme, dans l'autre sens) puis se commite dans `tatamap-content`. Le dépôt privé reste la source de vérité du contenu ; la base de prod en est une copie éditable.

### D6. Variables d'environnement et secrets

`/opt/tatamap/.env` (propriétaire `deploy`, `chmod 600`, jamais dans un repo), lu par `compose.prod.yml` :

| Variable | Valeur en prod |
| --- | --- |
| `NODE_ENV` | `production` |
| `SITE_DOMAIN` | `tatamap.fr` |
| `ACME_EMAIL` | une adresse sur `tatamap.fr` (avis d'expiration Let's Encrypt) |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` (hexadécimal : rien à échapper dans l'URL) |
| `DATABASE_URL` | composée dans `compose.prod.yml` : `postgresql://tatamap:${POSTGRES_PASSWORD}@db:5432/tatamap` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `WEB_ORIGINS` | `https://tatamap.fr` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `1` |
| `HOST` / `PORT` | `0.0.0.0` / `3000` |
| `LOG_LEVEL` | `info` |
| `CSP_PROFILE` | `adsense` au lancement (`strict` sans pub, D3) |
| `PRELAUNCH` | `on` jusqu'à l'audit, puis `off` |
| `WEB_DIGEST` / `API_DIGEST` / `TOOLS_DIGEST` | écrits par `deploy.sh` (empreintes des images en service) |

Sauvegardes, à part (`/etc/tatamap/backup.env` et `/etc/tatamap/rclone.conf`, `chmod 600`) : identifiants S3 d'un utilisateur Object Storage **dédié au seul bucket de sauvegarde**, clé publique `age` du destinataire, URL de ping de surveillance.

Changer `JWT_SECRET` déconnecte l'admin (seul effet) : à faire si le serveur est compromis.

### D7. Sauvegardes hors de la machine et test de restauration

- **Quotidien** (timer systemd, 03:30) : `backup.sh` lance `pg_dump -Fc` **dans** le conteneur `db` (même version que le serveur), chiffre le flux avec `age` vers une clé publique dont la clé privée n'est **que** chez Fares (gestionnaire de mots de passe + copie hors ligne), garde 7 fichiers en local et envoie le fichier par `rclone` vers un bucket OVH Object Storage d'une **autre région** que le VPS. Rétention distante : 35 jours, par une **règle de cycle de vie du bucket**, pas par le serveur. La clé S3 du serveur est en **écriture seule** et le bucket a **Object Lock** (ou à défaut le versioning) : un serveur compromis ne peut ni supprimer ni remplacer l'historique (âge ne prouve pas l'auteur d'un fichier, seule cette immuabilité protège). Réglages OVH à faire par Fares : `deploy/README.md`. Le dump contient le hash admin et les brouillons : d'où le chiffrement, le serveur ne pouvant pas relire ses propres sauvegardes.
- **Alerte** : en fin de script réussi, un ping vers un service de surveillance gratuit (type healthchecks.io) qui envoie un mail s'il ne reçoit rien pendant 26 h. Le même service (ou UptimeRobot) surveille `https://tatamap.fr/api/health`.
- La sauvegarde automatique d'un jour incluse dans le VPS sert à remettre la machine entière, pas de sauvegarde de base (même fournisseur, même compte, une seule journée).
- **Test de restauration** : à l'installation, puis chaque trimestre et avant toute migration lourde. `restore-test.sh <objet>`, sur l'ordinateur de Fares : télécharge **le dump nommé en argument** (jamais « le plus récent » : qui peut écrire dans le bucket choisirait), le déchiffre, le restaure (`pg_restore`) avec un rôle **non superutilisateur** dans une base jetable `tatamap_restore` qui lui appartient, sur le PostgreSQL 17 local (`docker-compose.yml`), vérifie la dernière migration appliquée (`_prisma_migrations`) et le nombre de techniques publiées, puis lance `content:export` vers un dossier temporaire et le compare au clone de `tatamap-content` (`diff -r`). La date du dernier test est notée dans `deploy/README.md`.
- **Reprise après sinistre** (cible : moins d'une heure) : nouveau VPS, bootstrap (D8), restauration du dernier dump, déploiement du SHA en cours, DNS. En dernier recours, le contenu publié se reconstruit depuis `tatamap-content` (`content:import`) et l'admin se recrée.

### D8. Durcissement minimal du VPS

- **Conteneurs** : `no-new-privileges` sur `caddy` et `api`, `cap_drop: [ALL]` (Caddy ne garde que `NET_BIND_SERVICE`).
- **Rôle PostgreSQL applicatif** : l'API et les outils se connectent encore avec l'unique rôle `tatamap` (propriétaire de la base, superutilisateur du conteneur). Un rôle DML seul pour l'API demande de créer le rôle et son mot de passe hors de Prisma migrate (le conteneur ne l'initialise qu'au premier démarrage, et une migration ne doit pas porter de secret) puis des `ALTER DEFAULT PRIVILEGES` pour chaque table future : laissé pour plus tard, la base ne contient que du contenu public et un hash admin, et l'API n'est pas exposée en SQL.

Proportionné : un seul service exposé (Caddy), une base qui ne contient que du contenu public et un hash admin.

- **OS** : Debian stable (ou Ubuntu LTS si Debian n'est pas proposé), image OVH minimale, Docker depuis le dépôt officiel de Docker.
- **Comptes** : `fares` (sudo, clé SSH personnelle), `deploy` (sans sudo, membre de `docker`, clé de la CI avec commande forcée). Pas de connexion root.
- **SSH** : `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `AllowUsers fares deploy`. Port 22 conservé (le changer n'apporte que du confort de journaux).
- **Pare-feu** : `ufw` : refus par défaut en entrée, ouverts 22/tcp, 80/tcp, 443/tcp, 443/udp. Rappel D1 : aucun `ports:` sur `api` ni `db`.
- **Mises à jour** : `unattended-upgrades` pour les correctifs de sécurité, redémarrage automatique à 04:30 si nécessaire (les conteneurs repartent seuls). Images : Caddy et PostgreSQL épinglées en mineure, montées par une PR (Renovate ou à la main, une fois par mois).
- **fail2ban** : jail `sshd` (5 essais, bannissement d'une heure). Avec l'authentification par clé seule, il sert surtout à réduire le bruit.
- **Accès console** : la console KVM d'OVH reste le recours si SSH est cassé ; compte OVH protégé par double authentification.

### D9. Ce que ça laisse ouvert (roadmap)

- **Hors ligne** : plus de PWA ; l'app mobile à venir lira la même API publique.
- **Espace club, freemium** : même API, même base ; un VPS-2 suffit longtemps.
- **Stripe** : webhooks sur `/api/webhooks/stripe`, même origine, aucun changement de topologie. La clé Stripe ira dans le `.env` du serveur.
- **Changer d'hébergeur** : les images GHCR et `compose.prod.yml` tournent partout ; la base se déplace par dump. Rien n'est propre à OVH sauf le DNS et le bucket.
- **AdSense au lancement** (décision du 2026-11-23) : profil `adsense` (D3), consentement par le CMP de Google (Confidentialité et messages, certifié TCF), politique de confidentialité qui nomme Google comme destinataire. Google n'examine un site qu'une fois en ligne et ouvert : la demande AdSense part juste après `PRELAUNCH=off`, les pubs arrivent après validation (de quelques jours à quelques semaines) ; d'ici là la colonne affiche les sponsors ou « Devenir sponsor ».

## Conséquences

- On administre une machine : environ une heure par mois (lire les mails de surveillance, monter les images, test de restauration trimestriel).
- Un seul point de panne. Acceptable pour des clubs testeurs.
- Les migrations Prisma s'appliquent à chaque déploiement, avant le redémarrage de l'API, et doivent rester compatibles avec la version précédente.
- Les mentions légales (lot 8) indiquent l'hébergeur : OVH SAS, avec son adresse et son téléphone tels que publiés par OVH.
- Le `TRUST_PROXY` mesuré en prod vaut 1 : le commentaire de `apps/api/.env.example` est à mettre à jour.

## Modifications proposées

`CLAUDE.md`, tableau Stack, ligne Hébergement :

```diff
-| Hébergement | Front Vercel ou Netlify, API + base Render ou Railway |
+| Hébergement | VPS OVH en France : Docker Compose (Caddy + API + PostgreSQL 17), même origine `https://tatamap.fr`, déploiement par GitHub Actions (SSH, commande forcée), sauvegardes chiffrées sur OVH Object Storage (ADR 0005) |
```

`CLAUDE.md`, phrase des décisions détaillées :

```diff
-Décisions détaillées : `docs/adr/` (0001 outillage, 0002 modèle de données et format de pose, 0003 admin, API d'écriture et éditeur, 0004 évolution du rendu 3D).
+Décisions détaillées : `docs/adr/` (0001 outillage, 0002 modèle de données et format de pose, 0003 admin, API d'écriture et éditeur, 0004 évolution du rendu 3D, 0005 hébergement).
```

`docs/plan-phase-3.md`, lot 8, première puce : remplacer « Décision à prendre avec l'architecte (ADR 0005) : Render ou Railway… » par « Décidé (ADR 0005) : VPS OVH, Caddy sert le front et relaie `/api/*` vers l'API. » ; « Décisions ouvertes », point 1 : « Décidé : ADR 0005. »

## Actions de Fares (OVH, DNS, comptes)

1. Commander `tatamap.fr` chez OVH (et `tatamap.com` si disponible, redirigé plus tard) ; activer DNSSEC si proposé ; double authentification sur le compte OVH.
2. Commander un **VPS-1** dans un datacenter **en France**, image Debian stable (ou Ubuntu LTS).
3. Créer un projet Public Cloud, un bucket Object Storage dans **une autre région** que le VPS, et un utilisateur S3 limité à ce bucket.
4. DNS : `A` (et `AAAA` si le VPS a une IPv6) de `tatamap.fr` vers le VPS, `www` en `CNAME` vers `tatamap.fr`, `CAA 0 issue "letsencrypt.org"`. TTL court pendant la mise en place. Une adresse de contact sur `tatamap.fr` (redirection mail).
5. Bootstrap du VPS en suivant `deploy/README.md` (comptes, SSH, pare-feu, Docker, `.env`, timer de sauvegarde).
6. Générer la paire `age` (clé privée chez lui seulement) et la clé SSH de déploiement ; créer l'environnement GitHub `production` et ses trois secrets ; rendre publics les paquets GHCR au premier push.
7. Créer les deux sondes de surveillance (sauvegarde, `/api/health`).
8. Après le premier déploiement : `create-admin`, `push-content.sh`, premier test de restauration ; passer `PRELAUNCH=off` après l'audit.

## Tâches de code du lot 8 (pour `dev`, puis `cybersecu`)

1. `Dockerfile` racine (cibles `web`, `api`, `tools`, utilisateur non root pour l'API), `.dockerignore`, test CI « aucun fichier de `content/` dans les images ».
2. `deploy/` : `compose.prod.yml`, `Caddyfile`, profils CSP `strict` et `adsense`, snippets `prelaunch`, `.env.example`, scripts `deploy.sh`, `backup.sh`, `restore-test.sh`, `push-content.sh`, `tatamap-deploy` (commande forcée), `README.md` (bootstrap + reprise).
3. `ci.yml` : jobs `images` et `deploy` (environnement `production`, `workflow_dispatch` avec `sha`), actions épinglées.
4. API : lever le `TODO(phase 3)` HSTS dans `app.ts` (valeur identique à Caddy), mettre à jour le commentaire `TRUST_PROXY` de `.env.example`.
5. `html.cspNonce` dans `vite.config.ts` et `templates` Caddy sur `index.html` (D3) ; vérifier les profils `adsense` (nonce identique dans la page et l'en-tête, AdSense chargé) et `strict` sur une pile Compose locale (bibliothèque, page technique, carte, éditeur) : console sans violation.
6. Pages légales (mentions légales avec l'hébergeur, confidentialité).
7. `cybersecu` : audit de la pile en ligne (en-têtes, ports ouverts, SSH, cookie, rate-limit derrière Caddy, sauvegarde chiffrée) avant `PRELAUNCH=off`.
