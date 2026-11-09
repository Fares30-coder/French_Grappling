# Tatamap

Site de techniques de jiu-jitsu brésilien / grappling en français, avec des animations 3D orientables. Contexte complet : `CLAUDE.md` ; décisions : `docs/adr/` ; plans : `docs/plan-phase-1.md`, `docs/plan-phase-2.md` (admin et saisie du contenu : ADR 0003).

## Démarrage rapide

Prérequis : Node 24 (`.nvmrc`), pnpm 12.15.0, Docker.

```sh
pnpm install
pnpm db:up        # PostgreSQL local (Docker)
cp apps/api/.env.example apps/api/.env   # puis remplir JWT_SECRET (voir ci-dessous)
pnpm db:migrate   # migrations
pnpm db:seed      # le ciseau depuis la garde fermée
pnpm dev          # web sur http://localhost:5173, API sur http://127.0.0.1:3000
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Ouvre le site sur `http://localhost:5173` (pas `127.0.0.1`) : l'API vérifie l'en-tête `Origin` et le cookie de session est `SameSite=Strict`.

## Variables d'environnement (`apps/api/.env`)

Le modèle est `apps/api/.env.example`. Les principales :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | base locale (le vrai contenu y vit) |
| `TEST_DATABASE_URL` | base des tests, **distincte** (`tatamap_test`) : `pnpm test` n'écrit jamais dans la base locale |
| `JWT_SECRET` | obligatoire, 32 octets minimum ; l'API refuse de démarrer sans. `openssl rand -base64 48` |
| `WEB_ORIGINS` | origines autorisées pour les requêtes d'écriture (`http://localhost:5173`) |
| `COOKIE_SECURE` | laisser `true` ; `false` seulement si Safari refuse un cookie `Secure` sur `http://localhost` (interdit en production) |
| `TRUST_PROXY` | nombre de proxys devant l'API (0 en local) |
| `CONTENT_DIR` | dossier du contenu exporté (défaut : `content/` à la racine) |

Si le port 5432 est pris, mets `DB_PORT=5433` dans un `.env` à la racine (lu par docker compose) et adapte les URL.

## Base de test

```sh
docker compose exec db createdb -U tatamap tatamap_test   # une seule fois
pnpm db:test:reset                                        # migre et seede la base de test
pnpm test
```

Sans `TEST_DATABASE_URL`, les tests de l'API refusent de démarrer (message explicite).

## Compte admin

```sh
pnpm admin:create <email>   # demande le mot de passe deux fois, sans l'afficher
```

Relancer la commande sur le même email change le mot de passe et déconnecte les sessions ouvertes. Ne jamais écrire le mot de passe dans la ligne de commande (historique du shell, liste des processus). Si le script n'a pas de terminal et que `ADMIN_PASSWORD` est nécessaire :

```sh
read -s ADMIN_PASSWORD; export ADMIN_PASSWORD
pnpm admin:create <email>
unset ADMIN_PASSWORD
```

## Saisir du contenu (admin web)

1. `pnpm admin:create <email>` (une fois), puis `pnpm dev`.
2. Ouvre `http://localhost:5173/admin` : connexion, liste des techniques, « Nouvelle technique », éditeur de poses (vues 3D / Face / Profil / Dessus, aperçu, publication). Cmd/Ctrl+S enregistre, Cmd/Ctrl+Z annule.
   Sous la vue 3D, « Vidéo de référence » ouvre une vidéo de démonstration locale (elle reste dans le navigateur, rien n'est envoyé) : à côté de la vue ou superposée et transparente, image par image. « Lier ce moment à l'étape » retient le moment de chaque étape (dans le navigateur, par numéro d'étape). Range les vidéos dans `content/references/` (repo privé), jamais dans ce repo : `.gitignore` refuse les vidéos.
3. Une technique publiée est visible sur `/techniques/<slug>`.

La méthode de saisie recommandée (dupliquer la technique la plus proche, soigner l'étape 1, etc.) est dans `docs/plan-phase-2.md`, section « Ce dont Fares a besoin pour saisir ses 15 techniques ».

## Sauvegarde du contenu

Le contenu (positions, tags, techniques) vit dans la base locale et n'est **pas** dans ce dépôt public. Il s'exporte en JSON triés (un fichier par technique) dans `content/`, un clone du dépôt **privé** `Fares30-coder/tatamap-content`, ignoré par git ici :

```sh
git clone git@github.com:Fares30-coder/tatamap-content.git content   # une seule fois
pnpm content:export     # base -> content/
git -C content add -A && git -C content commit -m "..." && git -C content push
pnpm content:import     # content/ -> base (upsert par slug, sans doublon, tout ou rien)
```

À faire **après chaque séance de saisie**. `pnpm content:export` supprime aussi les fichiers des techniques qui n'existent plus en base. `pnpm content:import` valide tous les fichiers avant d'écrire : un seul fichier invalide et rien n'est importé. Les scripts lisent `DATABASE_URL` et `CONTENT_DIR`.

> **Attention** : `pnpm db:reset` (et `prisma migrate reset`) **efface la base locale**, donc ton contenu. Fais `pnpm content:export` avant ; `pnpm content:import` le restaure (après `pnpm db:seed` si besoin).

## Outils d'animation

Pour écrire et vérifier des poses sans passer par l'éditeur web (package `tools/pose-kit`, privé) :

```sh
pnpm pose:check <slug|chemin.json> [--strict]   # contrôle une technique de CONTENT_DIR (défaut content/)
pnpm pose:separate <slug|chemin.json> [--write] [--steps-only]   # écarte les corps qui s'enfoncent
pnpm pose:render <slug|chemin.json> [--out dossier] [--steps 1,3] [--views 3d,face]
pnpm --filter @tatamap/pose-kit exec playwright install chromium   # une seule fois
```

- `pose:check` : validation du schéma (bloquante, code de sortie 1), puis, par étape, longueurs d'os hors tolérance (12 %) par rapport au **corps standard** `STANDARD_BODY_V2_21` de `@tatamap/shared` (même règle que l'éditeur ; l'ancienne comparaison avec l'étape 1 a disparu), articulations qui s'enfoncent dans le tatami, et alertes d'interpénétration. Cette dernière est une **heuristique grossière** sur le squelette nu (segments à moins de 6 cm, ou qui traversent le buste ou la tête de l'autre) : une prise au col peut la déclencher.
  S'y ajoute le **volume du mannequin** (`volume.ts`, mêmes rayons que le mannequin Blender) : capsules pour le buste (deux côte à côte, plus large que profond), la tête, les bras, les mains, les cuisses, les tibias et les pieds. `sinks in` signale deux parties enfoncées de plus de 3 cm l'une dans l'autre (entre les deux combattants, ou chez un même combattant : bras dans sa propre cuisse, avant-bras dans son ventre ou sa tête…), `to next` la même chose au pire moment de la transition vers l'étape suivante (les os tournent comme sur le site).
- `pose:separate` : écarte ces parties (relaxation : chaque paire est repoussée, puis les longueurs d'os sont rétablies, le tatami respecté et la pose rappelée vers l'originale), sur toutes les étapes à la fois et au milieu des transitions. Aucune articulation ne bouge de plus de 15 cm. Sans `--write`, affiche seulement ce qui changerait ; `--steps-only` ignore les transitions (étapes qui ne se suivent pas, comme `poses-de-reference`). Un membre qui passe d'un côté à l'autre d'un autre entre deux étapes ne peut pas être corrigé ainsi : il faut une étape intermédiaire. Vérifier ensuite dans l'éditeur.
- `pose:render` : lance Vite sur un port libre (arrêté ensuite), ouvre la route **dev uniquement** `/dev/pose-preview` (absente du build de production) avec le vrai viewer, et écrit dans `.pose-renders/<slug>/` (ignoré par git, ou `--out`) un PNG par étape et par vue (`3d` = caméra conseillée, `face` = plan x/y, `profil` = plan z/y, `dessus`) plus `contact-sheet.png`, qui regroupe tout en une image. `--server http://127.0.0.1:5173` réutilise un serveur déjà lancé.
- La bibliothèque (`@tatamap/pose-kit`) fournit `twoBoneIk`, `buildFighter`, `STANDARD_LENGTHS` (le corps standard, longueurs recommandées par défaut pour `buildFighter`), `rotateFighterX/Y/Z`, `translateFighter`, `boneLengthsOf`, `makePose` ; voir `tools/pose-kit/src/`.

## Commandes utiles

| Commande | Effet |
| --- | --- |
| `pnpm dev` | web + API |
| `pnpm db:up` / `pnpm db:down` | démarre / arrête PostgreSQL |
| `pnpm db:migrate` / `pnpm db:seed` | migrations / seed du ciseau |
| `pnpm db:reset` | **efface** la base locale (exporter avant) |
| `pnpm db:test:reset` | recrée la base de test |
| `pnpm admin:create <email>` | crée l'admin ou change son mot de passe |
| `pnpm content:export` / `pnpm content:import` | sauvegarde / restauration du contenu |
| `pnpm pose:check` / `pnpm pose:separate` / `pnpm pose:render` | contrôle / écartement des corps / captures d'une technique (voir « Outils d'animation ») |
