# Plan phase 1 — Socle

Objectif de la phase (CLAUDE.md) : **« le ciseau s'anime en lisant l'API »**.

Références : `CLAUDE.md`, `docs/adr/0001-monorepo-et-outillage.md` (outillage), `docs/adr/0002-modele-de-donnees-et-format-de-pose.md` (schéma Prisma, schémas Zod, format de pose). En cas de doute, ces ADR font foi ; si une décision doit changer, on passe d'abord par l'architecte.

Hors périmètre de la phase 1 : liste et filtres des techniques, `/carte`, admin et JWT, éditeur, PWA et service worker, CORS et déploiement, Tailwind « joli ». On ne prépare pas ces éléments au-delà de ce que décrivent les ADR.

## Arborescence cible en fin de phase 1

```
.
├── .github/workflows/ci.yml
├── .editorconfig
├── .gitignore                  # node_modules, dist, .env, **/src/generated, coverage
├── .nvmrc                      # 24
├── biome.json
├── docker-compose.yml          # service db: postgres:17-alpine
├── package.json                # private, packageManager pnpm@12.15.0, engines, root scripts
├── pnpm-workspace.yaml         # packages + catalog
├── pnpm-lock.yaml
├── tsconfig.base.json
├── CLAUDE.md
├── README.md                   # quick start (commands)
├── docs/
│   ├── adr/0001-monorepo-et-outillage.md
│   ├── adr/0002-modele-de-donnees-et-format-de-pose.md
│   └── plan-phase-1.md
├── packages/
│   └── shared/
│       ├── package.json        # @tatamap/shared, exports ./src/index.ts, no build
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── enums.ts
│           ├── common.ts
│           ├── technique.ts
│           ├── technique.test.ts
│           └── pose/
│               ├── skeleton-v1-11.ts
│               ├── pose.ts
│               └── pose.test.ts
├── apps/
│   ├── api/
│   │   ├── package.json        # @tatamap/api
│   │   ├── tsconfig.json
│   │   ├── tsdown.config.ts
│   │   ├── vitest.config.ts
│   │   ├── prisma.config.ts
│   │   ├── .env.example        # DATABASE_URL, PORT, HOST
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/<timestamp>_init/migration.sql
│   │   │   ├── seed.ts
│   │   │   └── seed-data/
│   │   │       ├── scissor-sweep.ts       # raw 2D/3D data + conversion -> Pose[]
│   │   │       └── scissor-sweep.test.ts
│   │   └── src/
│   │       ├── server.ts       # entry: loads env, buildApp(), listen
│   │       ├── app.ts          # buildApp({ prisma }) -> FastifyInstance (used by tests)
│   │       ├── env.ts          # Zod-validated process.env
│   │       ├── db.ts           # createPrisma(url) with @prisma/adapter-pg
│   │       ├── errors.ts       # error handler -> apiErrorSchema shape
│   │       ├── generated/      # Prisma client (gitignored)
│   │       ├── routes/
│   │       │   ├── health.ts
│   │       │   └── techniques.ts
│   │       ├── techniques/
│   │       │   ├── technique-repository.ts   # Prisma query for a published technique
│   │       │   ├── to-technique-detail.ts    # DB row -> TechniqueDetail (upgradePose)
│   │       │   └── techniques.test.ts        # integration tests via app.inject
│   │       └── enums-sync.test.ts    # Prisma enums == shared enums
│   └── web/
│       ├── package.json        # @tatamap/web
│       ├── tsconfig.json
│       ├── vite.config.ts      # react, tailwind, proxy /api -> http://127.0.0.1:3000
│       ├── vitest.config.ts
│       ├── index.html          # lang="fr"
│       └── src/
│           ├── main.tsx        # QueryClientProvider + RouterProvider
│           ├── router.tsx      # "/" and "/techniques/:slug"
│           ├── index.css       # @import "tailwindcss";
│           ├── lib/api.ts      # fetchJson(path, schema) -> parsed or ApiRequestError
│           ├── features/
│           │   ├── techniques/
│           │   │   ├── use-technique.ts       # TanStack Query + techniqueDetailSchema
│           │   │   └── TechniquePage.tsx
│           │   └── viewer/
│           │       ├── TechniqueViewer.tsx    # THE single reusable viewer
│           │       ├── FighterMesh.tsx
│           │       ├── Tatami.tsx
│           │       ├── interpolate.ts         # smoothstep + lerp of poses
│           │       ├── interpolate.test.ts
│           │       ├── timeline.ts            # elapsed ms -> { stepIndex, t }
│           │       └── timeline.test.ts
│           └── pages/HomePage.tsx             # temporary link to the scissor sweep
```

## Tâches pour l'agent `dev`, dans l'ordre

Règles générales pour chaque tâche : TypeScript strict, `pnpm lint`, `pnpm typecheck` et `pnpm test` verts avant de passer à la suivante, un commit par tâche (message en anglais), sur la branche `phase-1/socle`. Les versions sont celles de la table de l'ADR 0001.

---

### T0. Prérequis du poste (à faire par Fares)

Le poste a actuellement Node 20.11, sans pnpm ni Docker.
- Installer Node 24 LTS (via nvm, fnm ou Volta), puis `npm i -g pnpm@12.15.0`.
- Installer Docker Desktop (ou OrbStack).

**Fini quand** : `node -v` affiche `v24.x` (≥ 24.11), `pnpm -v` affiche `12.15.0`, `docker compose version` répond.

### T1. Squelette du monorepo

Créer à la racine `package.json` (avec les scripts de l'ADR 0001 §7, sauf `db:*` pour l'instant), `pnpm-workspace.yaml` (avec le catalogue), `.nvmrc`, `.gitignore`, `.editorconfig`, `tsconfig.base.json` et `biome.json`. Créer les trois paquets (`@tatamap/shared`, `@tatamap/api`, `@tatamap/web`) avec chacun un `package.json`, un `tsconfig.json` et les scripts `typecheck` et `test` (plus `dev` et `build` pour les apps). Pour l'instant : un `index.ts` minimal dans shared, `src/server.ts` vide de logique dans l'API, et une app Vite React minimale (« Tatamap » à l'écran). Mettre à jour le README avec le démarrage rapide.

**Fini quand** :
- `pnpm install` passe et produit `pnpm-lock.yaml` ;
- `pnpm lint`, `pnpm typecheck` et `pnpm test` passent (Vitest avec `--passWithNoTests` tant qu'aucun test n'existe) ;
- `pnpm build` produit `apps/web/dist` et `apps/api/dist/server.js` ;
- `pnpm dev` lance le web sur http://localhost:5173 et la page affiche « Tatamap » ;
- `apps/web` importe une constante de `@tatamap/shared` et l'affiche (preuve que la consommation en source fonctionne dans Vite **et** dans le bundle tsdown de l'API).

### T2. CI GitHub Actions (sans base)

Créer `.github/workflows/ci.yml` comme dans l'ADR 0001 §9, **sans** le service `postgres` ni les étapes `db:generate`, `migrate deploy` et `db:seed` (elles arrivent en T6).

**Fini quand** : un push de `phase-1/socle` (ou une PR vers `main`) donne un run vert sur GitHub.

### T3. `@tatamap/shared` : enums, pose `v1-11`, détail de technique

Implémenter `enums.ts`, `common.ts`, `pose/skeleton-v1-11.ts`, `pose/pose.ts` et `technique.ts` tels que dans l'ADR 0002 §D5, et tout réexporter depuis `index.ts`.

Tests (`pose.test.ts`, `technique.test.ts`), au minimum :
- les clés de `fighterPoseV1_11Schema.shape` sont égales à `JOINTS_V1_11` (même ordre) ;
- chaque os de `BONES_V1_11` référence des articulations existantes ;
- une pose valide (ciseau étape 1, voir T7) est acceptée ;
- sont rejetées : une articulation manquante, une articulation inconnue, un `y` négatif, un `NaN`, une valeur de 10 000 (mètres convertis deux fois), un tuple de 2 éléments, `skeleton: "v2-17"`, un combattant en trop ;
- `upgradePose` renvoie la pose `v1-11` à l'identique ;
- `techniqueDetailSchema` rejette des étapes numérotées 1, 3 ; une soumission avec `endPosition` non nulle ; un renversement avec `endPosition: null` ; un champ inconnu à la racine.

**Fini quand** : `pnpm --filter @tatamap/shared test` passe avec tous ces cas, et `shared` ne dépend que de `zod`.

### T4. PostgreSQL local avec docker-compose

Créer `docker-compose.yml` (ADR 0001 §8 : `postgres:17-alpine`, `127.0.0.1:5432:5432`, volume `tatamap-pgdata`, healthcheck `pg_isready`). Ajouter les scripts racine `db:up` et `db:down`. Créer `apps/api/.env.example`.

**Fini quand** : `pnpm db:up` puis `docker compose ps` montre `db` en `healthy`, et `docker compose exec db psql -U tatamap -c 'select 1'` répond.

### T5. Prisma : schéma, configuration, première migration

Dans `apps/api`, installer `prisma@7.10.1` (en dev), `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`, `pg` et `dotenv`. **Épingler les versions exactes** : `prisma@latest` est une RC 8. Écrire `prisma/schema.prisma`, `prisma.config.ts` et `src/db.ts` comme dans l'ADR 0002 §D3. Ajouter les scripts racine `db:generate`, `db:migrate` et `db:reset`. Ajouter `src/generated` au `.gitignore` et aux exclusions de Biome. Ajouter le test `enums-sync.test.ts` (enums Prisma égaux aux tableaux de shared ; test sans base).

**Fini quand** :
- `pnpm db:migrate --name init` crée `prisma/migrations/<ts>_init/migration.sql` (commité) ;
- `pnpm --filter @tatamap/api exec prisma migrate status` affiche « Database schema is up to date » ;
- `pnpm typecheck` passe avec le client généré ;
- `enums-sync.test.ts` passe.

### T6. Seed du ciseau

Écrire `prisma/seed-data/scissor-sweep.ts` (données et conversion, fonctions pures et exportées) et `prisma/seed.ts` (écriture en base). Spécification complète ci-dessous (« Spécification du seed »). Ajouter le script racine `db:seed`. Compléter la CI : service `postgres`, `db:generate`, `prisma migrate deploy` et `db:seed` (ADR 0001 §9, workflow complet).

**Fini quand** :
- `scissor-sweep.test.ts` passe (valeurs attendues ci-dessous, et les 5 poses passent `currentPoseSchema`) ;
- `pnpm db:seed` exécuté **deux fois de suite** réussit sans doublon : en base, 2 `Position`, 1 `Technique` (`published`), 5 `Step` avec `skeleton = 'v1-11'` et 1 `Tag` ;
- `pnpm db:reset` refait tout sans erreur ;
- la CI complète est verte.

### T7. API Fastify : socle

`src/env.ts` (Zod : `DATABASE_URL` obligatoire, `PORT` à 3000 par défaut, `HOST` à `127.0.0.1` par défaut, `LOG_LEVEL` à `info` par défaut). `src/app.ts` exporte `buildApp({ prisma })`, ce qui permet d'injecter le client dans les tests. `src/server.ts` charge l'env, crée Prisma, `listen`, et ferme proprement sur SIGINT/SIGTERM (`app.close()`, puis `prisma.$disconnect()`). `src/errors.ts` : un `setErrorHandler` qui renvoie la forme `apiErrorSchema` (une `ZodError` donne 400 `bad_request`, le reste 500 `internal`, sans fuite de stack) et un `setNotFoundHandler` qui renvoie 404 `not_found`. Route `GET /api/health` qui renvoie `{ "status": "ok" }`. Logger : celui de Fastify (pino), sans dépendance de plus. Le script `dev` lance `tsx watch src/server.ts`, le script `build` lance `prisma generate && tsdown`.

**Fini quand** :
- un test `app.inject` sur `GET /api/health` renvoie 200 et `{ status: 'ok' }`, et un test sur `GET /api/nope` renvoie 404 au format `apiErrorSchema` ;
- `pnpm --filter @tatamap/api dev` puis `curl -s localhost:3000/api/health` renvoie `{"status":"ok"}` ;
- `pnpm build`, puis `node apps/api/dist/server.js` avec le `.env`, répond aussi sur `/api/health`. En cas d'échec lié à Prisma dans le bundle, appliquer le repli de l'ADR 0001 §6 et le noter dans le README.

### T8. `GET /api/techniques/:slug`

- `routes/techniques.ts` : valide `params` avec `techniqueSlugParamsSchema` (400 si invalide), appelle le repository et renvoie `toTechniqueDetail(row)`, avec l'en-tête `Cache-Control: public, max-age=60`.
- `technique-repository.ts` : une seule requête Prisma, `findFirst({ where: { slug, status: 'published' }, include: { startPosition, endPosition, tags, steps: { orderBy: { order: 'asc' } }, chainsFrom: { where: { to: { status: 'published' } }, include: { to: true } } } })`.
- `to-technique-detail.ts` : fonction pure. Elle fait `poseSchema.parse(step.pose)` puis `upgradePose`, mappe les champs vers la forme de l'ADR 0002 §D5 (sans aucun id) et trie les tags par nom.

**Fini quand** (tests d'intégration `techniques.test.ts` sur la base seedée) :
- `GET /api/techniques/ciseau-garde-fermee` renvoie 200, le corps passe `techniqueDetailSchema.parse`, 5 étapes d'`order` 1 à 5, `startPosition.slug === 'garde-fermee'`, `endPosition.slug === 'montee'` ;
- `GET /api/techniques/inconnue` renvoie 404 `not_found` ;
- une technique créée en `draft` dans le test renvoie 404 (le test la supprime ensuite) ;
- `GET /api/techniques/Pas_Un_Slug` renvoie 400 `bad_request` ;
- `curl -s localhost:3000/api/techniques/ciseau-garde-fermee | head -c 300` montre le JSON.

### T9. Web : socle de données et de routes

Mettre en place Tailwind 4 (`@tailwindcss/vite`, `@import "tailwindcss"`), React Router (`createBrowserRouter` avec `/` et `/techniques/:slug`) et TanStack Query (`QueryClient` avec `staleTime` de 60 s). Dans `vite.config.ts`, un proxy `server.proxy['/api'] = 'http://127.0.0.1:3000'` : pas de CORS en phase 1. `lib/api.ts` fournit `fetchJson(path, schema)`, qui `fetch` puis `schema.parse` et lève une `ApiRequestError` (avec le statut et le code) en cas d'erreur. `use-technique.ts` fournit `useTechnique(slug)` et parse avec `techniqueDetailSchema`. `TechniquePage` affiche le nom, les étapes (titres) et les points clés, avec un état de chargement, une 404 (« Technique introuvable ») et une erreur générique. `HomePage` contient un lien vers `/techniques/ciseau-garde-fermee`. Les textes visibles sont en français, `index.html` est en `lang="fr"`.

**Fini quand** : avec `pnpm dev` et la base seedée, http://localhost:5173/techniques/ciseau-garde-fermee affiche « Ciseau depuis la garde fermée » et les 5 titres d'étapes ; `/techniques/inconnue` affiche « Technique introuvable » ; l'onglet réseau montre l'appel à `/api/techniques/ciseau-garde-fermee`.

### T10. Logique pure du viewer : interpolation et timeline

- `interpolate.ts` :
  - `smoothstep(t) = t * t * (3 - 2 * t)`, avec `t` borné à [0, 1] ;
  - `lerpVec3(a, b, t)` ;
  - `interpolatePose(a, b, t)`, qui applique l'interpolation linéaire à chaque articulation des deux combattants avec `smoothstep(t)` et renvoie un `CurrentPose` (sans caméra).
- `timeline.ts` : `buildTimeline(steps, { holdMs = 1200 })` produit des segments `[maintien de l'étape i][transition i → i+1 de steps[i+1].transitionMs]`… jusqu'au maintien de la dernière étape. Ensuite, `sampleTimeline(timeline, elapsedMs, { loop })` renvoie `{ stepIndex, nextIndex, t }` : `t = 0` pendant un maintien, `t ∈ ]0, 1[` pendant une transition. En boucle, on repart à l'étape 1 après le dernier maintien, **sans** transition interpolée de la dernière vers la première (on coupe net). Enfin, `timeAtStep(timeline, i)` renvoie le début du maintien de l'étape i (pour sauter à une étape).
- La vitesse s'applique en amont : `elapsed += delta * speed`.

**Fini quand** : tests unitaires verts, couvrant `smoothstep(0) = 0`, `smoothstep(0.5) = 0.5`, `smoothstep(1) = 1` ; `interpolatePose(a, b, 0)` égal à `a` et `(a, b, 1)` égal à `b` ; la durée totale pour 5 étapes = 5 × 1200 + somme des `transitionMs` des étapes 2 à 5 ; l'échantillonnage au milieu d'une transition donne `t = 0.5` ; le bouclage ; `timeAtStep`.

### T11. Viewer R3F : affichage statique

`TechniqueViewer` est **le** composant réutilisable : page technique maintenant, vignette et éditeur plus tard. Contrat proposé :

```ts
type TechniqueViewerProps = {
  steps: ReadonlyArray<{ pose: CurrentPose; transitionMs: number }>;
  stepIndex: number;                 // controlled: step to show / play from
  playing: boolean;
  speed?: number;                    // default 1
  loop?: boolean;                    // default true
  holdMs?: number;                   // default 1200
  interactive?: boolean;             // OrbitControls on/off (default true; false for thumbnails)
  onStepChange?: (index: number) => void; // emitted when playback enters a new step
  className?: string;
};
```

Pour ce lot, on affiche seulement `steps[stepIndex].pose`, sans animation.
- `<Canvas>` : caméra perspective avec `fov` 40, `near` 1, `far` 5000. Position et cible issues de `steps[0].pose.camera`, sinon `[170, 170, 300]` → `[0, 40, 20]`.
- `OrbitControls` de drei avec la même cible.
- Éclairage : une lumière ambiante et une lumière directionnelle.
- `Tatami` : un plan horizontal à y = 0, d'environ 600 × 600, de couleur neutre.
- `FighterMesh` (un par combattant, couleur prise dans `FIGHTER_COLORS`) : 11 sphères (tête de rayon `HEAD_RADIUS_CM`, autres articulations de rayon 5) et 9 cylindres de rayon 4 selon `BONES_V1_11`.
- Les meshes sont créés une fois. Leurs positions et orientations sont mises à jour **impérativement** via des refs : un cylindre se place au milieu de ses deux articulations, avec un quaternion de `(0, 1, 0)` vers la direction de l'os et `scale.y` égal à la longueur, sur une géométrie de hauteur 1. Pas de `setState` par frame.
- `TechniquePage` affiche le viewer dans un conteneur 16/9, avec l'étape 1.

**Fini quand** : sur `/techniques/ciseau-garde-fermee`, on voit le combattant vert allongé sur le dos et le combattant orange à genoux dans sa garde (étape 1). La caméra tourne et zoome à la souris. Aucune erreur dans la console. Une capture d'écran est jointe au commit ou à la PR.

### T12. Lecture animée et synchronisation des étapes : critère de la phase 1

- Dans `TechniqueViewer`, un `useFrame` fait avancer un `elapsedRef` (avec `delta × 1000 × speed`) quand `playing` est vrai. Il échantillonne la timeline, interpole et met à jour les refs des meshes. Quand `stepIndex` change de l'extérieur, `elapsed` est recalé avec `timeAtStep`. Quand la lecture entre dans une nouvelle étape, le composant appelle `onStepChange`, sans boucle de rétroaction : on ignore la mise à jour qu'on vient d'émettre.
- Dans `TechniquePage` :
  - bouton lecture/pause ;
  - sélecteur de vitesse (0,5×, 1×, 2×) ;
  - liste des 5 étapes (numéro et titre) avec l'étape courante surlignée, un clic sautant à l'étape et mettant en pause ;
  - le texte de l'étape courante ;
  - les points clés et les erreurs fréquentes.
- La lecture démarre automatiquement.

**Fini quand** (critère de la phase 1) :
1. `pnpm db:reset && pnpm dev`, puis l'ouverture de `/techniques/ciseau-garde-fermee` : le ciseau s'anime en boucle sur les 5 étapes (maintien d'environ 1,2 s, transitions lissées d'environ 1,3 s), et l'étape surlignée suit l'animation.
2. Pause, clic sur l'étape 4, puis lecture : la lecture reprend à l'étape 4. En 2×, la boucle dure deux fois moins longtemps.
3. La caméra reste libre pendant la lecture.
4. **Preuve que les données viennent de l'API** : si on change le titre de l'étape 2 en base (`prisma studio` ou SQL), puis qu'on recharge la page, le nouveau titre apparaît. Si on arrête l'API, la page affiche l'état d'erreur.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` passent, et la CI est verte.

Ensuite : ouvrir une PR `phase-1/socle` → `main`, avec une revue par `architecte` (respect des ADR) et par `cybersecu` (env, erreurs, en-têtes).

---

## Spécification du seed (T6)

Source : la section « Données du prototype » de `CLAUDE.md`. Recopier `ME_2D`, `OPP_2D`, `ME_5` et `OPP_5` tels quels dans `scissor-sweep.ts`.

**Conversion 2D → 3D** (étapes 1 à 4 de `me`, étapes 1 à 3 de `opponent`), articulation d'index `i` dans l'ordre `JOINTS_V1_11` :
- `x3 = x - 300`
- `y3 = 306 - y`
- `z3 = 0` pour `head`, `neck` et `hip` ; `+16` pour les articulations finissant par `L` ; `-16` pour celles finissant par `R`.

**Étape 4** :
- `me` = conversion de `ME_2D[3]`, puis **+18 en z** sur toutes les articulations.
- `opponent` = la pose 3D de l'adversaire à l'étape 3, tournée de **θ = +55°** autour de l'axe X qui passe par l'origine (`y' = y·cosθ − z·sinθ`, `z' = y·sinθ + z·cosθ`, x inchangé), puis translatée en y pour que **le y minimal vaille 6**. Le signe + fait basculer l'adversaire vers +z, ce qui est cohérent avec l'étape 5 où sa tête est à z = 140.
- Arrondir toutes les coordonnées à 0,1 cm.

**Étape 5** : `ME_5` et `OPP_5`, déjà en 3D, à reprendre tels quels.

**Caméra** : `{ position: [170, 170, 300], target: [0, 40, 20] }` sur chaque étape.

**Valeurs attendues** (à mettre dans `scissor-sweep.test.ts`) :
- étape 1, `me.head` = `[-150, 24, 0]`, `me.handL` = `[-10, 91, 16]`, `me.footR` = `[45, 34, -16]` ;
- étape 4, `me.hip` = `[0, 21, 18]` ;
- étape 4, `opponent.head` ≈ `[-28, 91.4, 109.8]`, `opponent.footL` ≈ `[72, 6, 15.7]`, et min(y) de `opponent` = 6 ;
- les 5 poses passent `currentPoseSchema.parse`.

**Contenu en base** (textes en français, à faire relire par Fares) :

| Entité | Valeurs |
| --- | --- |
| Position | `garde-fermee` « Garde fermée », role `bottom`, description « Tu es sur le dos, jambes croisées autour de la taille de l'adversaire. » |
| Position | `montee` « Montée », role `top`, description « Tu es assis sur le ventre de l'adversaire, genoux au sol. » |
| Tag | `fondamentaux` « Fondamentaux » |
| Technique | slug `ciseau-garde-fermee`, nom « Ciseau depuis la garde fermée », `sweep`, `beginner`, `gi`, `published`, `publishedAt = now()`, départ `garde-fermee`, arrivée `montee`, tag `fondamentaux` |
| Points clés | « Casse la posture de l'adversaire avant de faucher. » ; « Décale les hanches pour placer le tibia en travers de son ventre. » ; « Garde le contrôle de la manche du côté où il tombe. » |
| Erreurs fréquentes | « Rester à plat sur le dos au lieu de se mettre sur la hanche. » ; « Faucher sans l'avoir d'abord tiré vers l'avant. » ; « Lâcher la manche : il pose la main et bloque le renversement. » |
| Étapes 1 à 5 | titres = les 5 libellés de `CLAUDE.md` (« Garde fermée : contrôle du col et de la manche », etc.), `text` vide, `transitionMs` 1300, `skeleton` `'v1-11'` |

**Idempotence** : dans une transaction, `upsert` des positions et du tag par slug, puis `upsert` de la technique par slug, puis `deleteMany` des étapes de la technique et `createMany` des 5 étapes. Avant d'écrire, chaque pose passe par `currentPoseSchema.parse` : si une pose est invalide, le seed échoue bruyamment.

## Prochaines actions

1. **Fares** : T0 (Node 24, pnpm, Docker) ; valider ou refuser les écarts proposés dans les ADR (voir les sections « Proposition de modification de `CLAUDE.md` ») ; relire les textes du seed.
2. **dev** : T1 → T12 dans l'ordre, un commit par tâche.
3. **cybersecu** : revue après T7 et T8 (validation de l'env, gestionnaire d'erreurs sans fuite, port lié à 127.0.0.1, `.env` ignoré, identifiants docker limités au local).
4. **architecte** : revue de la PR finale, puis ADR 0003 pour la phase 2 (routes admin, JWT, schéma d'écriture, éditeur de poses).
