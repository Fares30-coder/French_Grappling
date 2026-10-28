# ADR 0001 — Monorepo et outillage

- Statut : accepté
- Date : 2026-10-28
- Auteur : agent architecte (pour Fares Haouari)
- Portée : phase 1 (socle), avec les phases 2 à 4 en ligne de mire

## Contexte

Le repo ne contient que `CLAUDE.md`, `README.md` et `.claude/agents/`. `CLAUDE.md` fixe la stack (React + Vite + TS + Tailwind + R3F côté front, Fastify + Prisma + PostgreSQL côté API, Zod partagé) et la structure monorepo `apps/web`, `apps/api`, `packages/shared`. Il reste à choisir l'outillage pour que l'agent `dev` puisse démarrer sans avoir à trancher.

Contraintes : projet solo, budget nul ou presque, peu de temps de maintenance. On veut un outillage **minimal** : chaque outil ajouté doit remplacer quelque chose, pas s'empiler.

Versions vérifiées sur le registre npm le 2026-10-28 (voir « Versions » en fin de document).

Constat sur le poste de Fares : Node **v20.11.0** est installé (trop ancien : Vite 8 et Prisma 7 demandent au moins 20.19, Vitest 5 demande 22.12), pnpm n'est pas installé et Docker non plus. Voir la tâche 0 de `docs/plan-phase-1.md`.

## Décisions

### 1. Gestionnaire de paquets : pnpm 12 avec workspaces et catalogue

**Décision.** pnpm `12.15.0`, épinglé via le champ `packageManager` du `package.json` racine. Workspaces déclarés dans `pnpm-workspace.yaml` (`apps/*`, `packages/*`). Les dépendances communes à plusieurs paquets (zod, typescript, vitest, @types/node, react, react-dom) sont versionnées **une seule fois** dans le `catalog:` de `pnpm-workspace.yaml` et référencées par `"zod": "catalog:"`.

Installation : `npm install -g pnpm@12.15.0` (Corepack n'est plus livré avec Node à partir de la v25, on ne s'appuie donc pas dessus).

Compromis :
- npm workspaces : zéro installation mais pas de catalogue, hoisting laxiste (dépendances fantômes), plus lent. Rejeté.
- Bun : rapide mais ajoute un deuxième runtime à connaître et à déployer. Rejeté.
- pnpm 12 est une réécriture récente (août 2026). Si un bug bloquant apparaît, repli sur `pnpm@11` (ligne 11 toujours maintenue) en changeant uniquement `packageManager` ; le lockfile se régénère.
- Pas de Turborepo ni Nx : avec trois paquets, `pnpm -r` et `--filter` suffisent. À reconsidérer seulement si la CI dépasse ~5 minutes.

### 2. Version de Node : 24 LTS

**Décision.** Node **24.x** (LTS, support jusqu'à fin avril 2028), fixé dans `.nvmrc` (`24`) et dans `"engines": { "node": ">=24.11 <25" }` à la racine. La CI lit `.nvmrc`.

Compromis : Node 26 vient de passer LTS (octobre 2026) et durera un an de plus, mais le support côté hébergeurs (Render, Railway, image de build Vercel/Netlify) et la maturité de l'écosystème sont plus sûrs sur 24. Passage à 26 prévu en phase 4 (une ligne à changer dans `.nvmrc`).

### 3. TypeScript : 6.0, un `tsconfig.base.json` strict, pas de références de projet

**Décision.** `typescript@~6.0.3` (via le catalogue). TypeScript 7 (compilateur natif) est sorti mais une partie de l'outillage qui s'appuie sur l'API du compilateur n'est pas encore à jour (typescript-eslint plafonne à `<6.1`, par exemple). On n'a pas besoin de la vitesse de TS 7 sur un projet de cette taille ; on le réévaluera en phase 3.

`tsconfig.base.json` à la racine, étendu par chaque paquet :

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

- `apps/web/tsconfig.json` ajoute `"lib": ["ES2023", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"`, `"types": ["vite/client"]`.
- `apps/api/tsconfig.json` ajoute `"types": ["node"]`.
- `packages/shared/tsconfig.json` n'ajoute rien (aucune API DOM ni Node dans `shared`, c'est voulu : il doit tourner partout).
- `exactOptionalPropertyTypes` est **volontairement désactivé** : il crée beaucoup de friction avec Prisma et Zod pour un gain faible.
- Convention : pas de `enum` TypeScript (on utilise des tableaux `as const` + `z.enum`), pas de `namespace`.

**Pas de références de projet** (`composite`, `tsc -b`) : chaque paquet fait `tsc --noEmit` de son côté (`pnpm -r typecheck`). Comme `shared` est consommé en source (point 6), son code est vérifié une fois par consommateur. Le coût est négligeable à cette taille, et on évite la gestion des `.d.ts` et de l'ordre de build.

`moduleResolution: "bundler"` vaut aussi pour l'API parce qu'elle est bundlée (point 6) et lancée en dev avec `tsx`. Conséquence : les imports relatifs s'écrivent **sans extension**.

### 4. Lint et format : Biome 2

**Décision.** `@biomejs/biome@2.6.x` à la racine, un seul `biome.json`. Il remplace ESLint et Prettier : un seul binaire, pas de plugins, pas de conflits de règles.

Configuration de départ : `recommended`, plus le domaine React (règles des hooks, `useExhaustiveDependencies`), le tri des imports, guillemets simples, indentation de 2 espaces, largeur 100. Ignorer `**/dist`, `**/generated`, `**/*.gen.*`.

Scripts : `pnpm lint` → `biome ci .` (en lecture seule, pour la CI) ; `pnpm format` → `biome check --write .`.

Compromis : pas de règles qui demandent l'analyse des types (comme `no-floating-promises` de typescript-eslint). C'est acceptable en solo : `tsc` en mode strict couvre l'essentiel. Si des promesses oubliées posent problème, on ajoutera typescript-eslint pour cette seule règle.

### 5. Tests : Vitest 5

**Décision.** `vitest@5.0.x` (via le catalogue), un script `test` par paquet, lancé à la racine par `pnpm -r test`. Pas de `vitest.workspace` ni de `test.projects` pour l'instant.

- `packages/shared` : tests unitaires des schémas Zod (poses valides et invalides, détail de technique).
- `apps/api` : tests d'intégration avec `app.inject()` de Fastify sur une **vraie base PostgreSQL** (Docker en local, service `postgres` en CI), migrée et seedée. On ne mocke pas Prisma.
- `apps/web` : tests unitaires de la logique pure du viewer (interpolation, timeline) en environnement `node`. Pas de tests de rendu React ni de jsdom en phase 1. Le rendu 3D se vérifie à l'œil.
- Pas d'e2e (Playwright) avant la phase 3 (test en club / PWA).

### 6. Consommation de `packages/shared` : en source TypeScript, sans étape de build

**Décision.** `@tatamap/shared` est un paquet interne **sans build** :

```jsonc
// packages/shared/package.json (extrait)
{
  "name": "@tatamap/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "catalog:" }
}
```

Les apps le déclarent avec `"@tatamap/shared": "workspace:*"`.

- **web** : Vite compile le TS du paquet comme le reste.
- **api en dev** : `tsx watch src/server.ts` résout et compile le TS à la volée.
- **api en prod** : `tsdown` (bundler basé sur Rolldown, `0.23.x`) produit `apps/api/dist/server.js` en ESM pour Node 24. Il **embarque** `@tatamap/shared` (paquet workspace en TS) et le client Prisma généré (dans `src/generated`), et laisse les vraies dépendances de `node_modules` en externe (`fastify`, `pg`, `@prisma/client`, etc.). La production lance `node dist/server.js`.
- **Tests** : Vitest résout le TS directement.

Compromis : on renonce à publier `shared` sur npm (ce n'est pas un objectif) et toute app qui le consomme doit savoir compiler du TS (c'est le cas des trois). En échange : pas de `dist` à reconstruire, pas de mode watch, et un « aller à la définition » qui mène au vrai code source.

Repli si le bundle Prisma pose problème en prod : lancer l'API avec `tsx src/server.ts` (un peu plus lent au démarrage, sans autre conséquence à notre échelle).

### 7. Scripts racine

`package.json` racine (`private: true`) :

| Script | Commande | Rôle |
| --- | --- | --- |
| `dev` | `pnpm --parallel --filter @tatamap/api --filter @tatamap/web dev` | API (port 3000) et web (port 5173) en parallèle |
| `build` | `pnpm -r build` | build de web (Vite) et de l'api (tsdown) |
| `typecheck` | `pnpm -r typecheck` | `tsc --noEmit` dans chaque paquet |
| `lint` | `biome ci .` | lint et format en lecture seule |
| `format` | `biome check --write .` | corrige lint et format |
| `test` | `pnpm -r test` | `vitest run` dans chaque paquet |
| `db:up` | `docker compose up -d db` | démarre PostgreSQL |
| `db:down` | `docker compose down` | arrête PostgreSQL (le volume est conservé) |
| `db:generate` | `pnpm --filter @tatamap/api exec prisma generate` | génère le client Prisma |
| `db:migrate` | `pnpm --filter @tatamap/api exec prisma migrate dev` | crée ou applique les migrations en dev |
| `db:seed` | `pnpm --filter @tatamap/api exec prisma db seed` | seed (le ciseau) |
| `db:reset` | `pnpm --filter @tatamap/api exec prisma migrate reset --force` | remet la base à zéro, migre et seede |

Pas de `postinstall` qui génère le client Prisma (ça rend `pnpm install` dépendant de `DATABASE_URL`, source de pièges en CI comme sur l'hébergeur). On appelle `db:generate` explicitement : en CI et dans la commande de build de l'API (`prisma generate && tsdown`).

### 8. Base locale : docker-compose avec PostgreSQL 17

**Décision.** `docker-compose.yml` à la racine avec un service `db` basé sur `postgres:17-alpine`, le port 5432 publié **sur 127.0.0.1 uniquement**, un volume nommé `tatamap-pgdata` et un healthcheck `pg_isready`. Identifiants de dev `tatamap` / `tatamap`, base `tatamap`. Ils ne servent qu'en local et ne sont jamais réutilisés ailleurs.

PostgreSQL 17 plutôt que 18 : disponible partout chez les hébergeurs visés, et pas de piège lié au nouveau chemin du volume de l'image 18. Le passage à 18 se fera quand l'hébergeur de prod sera choisi.

`apps/api/.env` (ignoré par git) contient `DATABASE_URL=postgresql://tatamap:tatamap@localhost:5432/tatamap`. On commite un `apps/api/.env.example`.

### 9. CI GitHub Actions minimale

**Décision.** Un seul workflow `.github/workflows/ci.yml`, un seul job, déclenché sur `push` vers `main` et sur toutes les `pull_request`.

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: tatamap
          POSTGRES_PASSWORD: tatamap
          POSTGRES_DB: tatamap
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U tatamap"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://tatamap:tatamap@localhost:5432/tatamap
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6        # reads "packageManager" from package.json
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm --filter @tatamap/api exec prisma migrate deploy
      - run: pnpm db:seed
      - run: pnpm test
      - run: pnpm build
```

Le service `postgres` et les étapes `migrate deploy` / `db:seed` ne sont ajoutés qu'à partir de la tâche qui introduit Prisma (voir le plan). Avant, le workflow s'arrête à lint, typecheck, test et build.

Pas de déploiement automatique en phase 1. Le déploiement (Vercel ou Netlify pour le web, Render ou Railway pour l'API) fera l'objet d'un ADR quand on en aura besoin (phase 3).

## Conséquences

- Pour démarrer, il suffit d'avoir Node 24, pnpm 12 et Docker, puis de lancer `pnpm install`, `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed` et `pnpm dev`.
- Un seul fichier de config par préoccupation : `tsconfig.base.json`, `biome.json`, `pnpm-workspace.yaml`, `ci.yml`.
- Les versions communes sont centralisées dans le catalogue pnpm : pas de dérive de version de zod entre web, api et shared (deux instances de zod casseraient `instanceof ZodError`).
- Points à surveiller :
  - **Prisma** : le dist-tag `latest` du paquet `prisma` pointe actuellement vers `8.0.0-rc.28` (une release candidate), alors que `@prisma/client@latest` est en `7.10.1`. **Il faut épingler explicitement `prisma@7.10.1` et `@prisma/client@7.10.1`** (et `@prisma/adapter-pg@7.10.1`). Un `pnpm add prisma` sans version installerait la RC.
  - Si pnpm 12 ou TS 6 posent problème, le repli tient en une ligne (voir plus haut).

### Proposition de modification de `CLAUDE.md`

Dans le tableau « Stack », ajouter :

```md
| Outillage | pnpm 12 (workspaces + catalogue), Node 24 LTS, TypeScript 6 strict, Biome (lint + format), Vitest |
| Base locale | PostgreSQL 17 via docker-compose |
```

et remplacer « Back | Node + Fastify (Express envisagé, Fastify par défaut) + TypeScript » par « Back | Node 24 + Fastify 5 + TypeScript (build tsdown, dev tsx) ».

## Versions (registre npm, 2026-10-28)

| Paquet | Version retenue | Remarque |
| --- | --- | --- |
| pnpm | 12.15.0 | repli : 11.28.x |
| node | 24.x LTS | 26 LTS depuis octobre 2026, à adopter en phase 4 |
| typescript | ~6.0.3 | 7.0.2 disponible, reporté |
| @biomejs/biome | 2.6.x | |
| vitest | 5.0.x | Node ≥ 22.12 |
| vite | 8.3.x | |
| @vitejs/plugin-react | 6.x | |
| tailwindcss / @tailwindcss/vite | 4.3.x | |
| react / react-dom | 19.3.x | R3F 9 exige < 19.4 |
| @react-three/fiber | 9.8.x | |
| @react-three/drei | 10.7.x | |
| three / @types/three | 0.186.x | |
| react-router | 8.5.x | |
| @tanstack/react-query | 5.105.x | |
| fastify | 5.12.x | |
| @fastify/cors | 11.x | pas utile en phase 1 (proxy Vite) |
| zod | 4.6.x | |
| prisma / @prisma/client / @prisma/adapter-pg | **7.10.1 (épinglé)** | `prisma@latest` = 8.0.0-rc |
| pg | 8.x | |
| tsx | 4.23.x | |
| tsdown | 0.23.x | Node ≥ 24.11 |
| dotenv | 18.x | chargé par `prisma.config.ts` et par l'API |
| GitHub Actions | checkout v7, setup-node v7, pnpm/action-setup v6 | |
