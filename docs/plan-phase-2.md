# Plan phase 2 — Contenu

Objectif de la phase (CLAUDE.md) : **« 15 techniques publiées »**.

Références : `CLAUDE.md`, ADR 0001 et 0002 (acceptés), **ADR 0003** (`docs/adr/0003-admin-ecriture-et-editeur.md`, à accepter par Fares avant de commencer). Le code des schémas, le contrat des routes et le contrat du viewer sont dans l'ADR 0003 : ce plan y renvoie (§A1, §C4…) au lieu de les recopier. En cas de doute, l'ADR fait foi ; si une décision doit changer, on repasse par l'architecte.

Hors périmètre : bibliothèque publique (`GET /api/techniques?…`, `/api/positions`, `/api/tags`, `/api/graph`), `/carte`, PWA, CORS, déploiement, vignettes (stratégie décidée en ADR 0003 §D4, implémentée en phase 3).

## Arborescence : fichiers ajoutés (+) et modifiés (~)

```
.
├── ~ package.json                     # scripts admin:create, content:export, content:import, db:test:reset
├── ~ .github/workflows/ci.yml         # env TEST_DATABASE_URL
├── ~ README.md                        # admin, env, base de test, workflow de contenu
├── ~ CLAUDE.md                        # only if Fares accepts ADR 0003 (text in the ADR)
├── content/                           # NOT in this repo: clone of private Fares30-coder/tatamap-content (gitignored)
├── docs/
│   ├── + adr/0003-admin-ecriture-et-editeur.md
│   └── + plan-phase-2.md
├── packages/shared/src/
│   ├── ~ index.ts
│   ├── + defaults.ts                  # DEFAULT_CAMERA, DEFAULT_TRANSITION_MS, DEFAULT_HOLD_MS
│   ├── ~ common.ts                    # API_ERROR_REASONS, reason?
│   ├── + slug.ts / slug.test.ts       # slugify
│   ├── ~ technique.ts / technique.test.ts   # techniqueDetailBaseSchema + invariants
│   ├── + content.ts / content.test.ts # contentTechniqueSchema (by slugs) for export/import
│   ├── admin/
│   │   ├── + common.ts                # idSchema, idParamsSchema, versionInputSchema, label inputs
│   │   ├── + technique.ts             # create/update/admin detail/list schemas
│   │   ├── + technique.test.ts
│   │   ├── + publish.ts / publish.test.ts
│   │   ├── + position.ts
│   │   ├── + tag.ts
│   │   └── + auth.ts
│   └── pose/
│       ├── + edit.ts / edit.test.ts   # mirrorPose, clampVec3, boneLengths, poseWarnings
│       └── + starter-pose.ts          # STARTER_POSE
├── apps/api/
│   ├── ~ package.json                 # 5 new deps
│   ├── ~ .env.example                 # JWT_SECRET, WEB_ORIGINS, COOKIE_SECURE, TRUST_PROXY, TEST_DATABASE_URL, NODE_ENV
│   ├── ~ prisma.config.ts             # PRISMA_TARGET=test -> TEST_DATABASE_URL
│   ├── ~ tsdown.config.ts             # + scripts/create-admin.ts entry
│   ├── ~ prisma/schema.prisma         # Technique.version
│   ├── + prisma/migrations/<ts>_phase2_admin/migration.sql   # + CHECK Chain_no_self_link
│   ├── ~ prisma/seed.ts               # toStepCreateData, shared defaults
│   ├── ~ prisma/seed-data/scissor-sweep.ts   # shared defaults
│   ├── + scripts/create-admin.ts
│   ├── + scripts/content-export.ts
│   ├── + scripts/content-import.ts
│   └── src/
│       ├── ~ app.ts                   # buildApp({ prisma, config }), helmet, cookie, jwt, rate-limit, bodyLimit, trustProxy, redact
│       ├── ~ env.ts                   # ADR 0003 §B8 + toAppConfig(env)
│       ├── + config.ts                # AppConfig type
│       ├── ~ errors.ts                # sendApiError(..., reason?)
│       ├── ~ server.ts
│       ├── ~ test-setup.ts            # requires TEST_DATABASE_URL
│       ├── + test-utils.ts            # testConfig(), buildTestApp(), createTestAdmin(), login(), uniqueSlug(), ORIGIN
│       ├── auth/
│       │   ├── + password.ts / password.test.ts
│       │   ├── + session.ts           # cookie options, issue/clear, sliding renewal
│       │   ├── + origin-check.ts      # global onRequest hook (unsafe methods)
│       │   ├── + admin-plugin.ts      # prefix /api/admin: auth hook, no-store, registers admin routes
│       │   ├── + fastify.d.ts         # request.admin typing
│       │   └── + auth.test.ts
│       ├── routes/
│       │   ├── + auth.ts              # login, logout
│       │   └── admin/
│       │       ├── + me.ts
│       │       ├── + techniques.ts
│       │       ├── + positions.ts
│       │       └── + tags.ts
│       ├── techniques/
│       │   ├── + step-data.ts / step-data.test.ts      # toStepCreateData
│       │   ├── ~ technique-repository.ts               # stable chain orderBy
│       │   ├── + admin-technique-repository.ts
│       │   ├── + to-admin-technique.ts
│       │   ├── + technique-write.ts                    # create/update/publish/unpublish/duplicate/delete + toTechniqueWriteData
│       │   └── + admin-techniques.test.ts
│       ├── positions/ + position-write.ts, + admin-positions.test.ts
│       └── tags/ + admin-tags.test.ts
└── apps/web/src/
    ├── + vite-env.d.ts                # VITE_API_URL
    ├── ~ lib/api.ts                   # apiRequest, apiSend, credentials, base URL, reason
    ├── ~ router.tsx                   # lazy /admin routes
    ├── features/
    │   ├── viewer/
    │   │   ├── + TechniqueScene.tsx   # extracted scene, owns camera
    │   │   ├── ~ TechniqueViewer.tsx  # Canvas + scene + children
    │   │   ├── ~ FighterMesh.tsx      # picking, highlight, ghost variant
    │   │   ├── + camera.ts / camera.test.ts         # frameCamera(view, hint, width)
    │   │   ├── + reapply.ts / reapply.test.ts       # shouldReapplyPose
    │   │   └── ~ timeline.ts          # DEFAULT_HOLD_MS from shared
    │   ├── techniques/
    │   │   ├── + TechniqueView.tsx    # presentational page body (public page + admin preview)
    │   │   └── ~ TechniquePage.tsx    # uses TechniqueView, "Recentrer" button
    │   └── admin/
    │       ├── + AdminLayout.tsx
    │       ├── + api.ts               # TanStack Query hooks for /api/admin/* and /api/auth/*
    │       ├── auth/ + LoginPage.tsx, + RequireAdmin.tsx, + safe-next.ts / safe-next.test.ts
    │       ├── techniques/ + AdminTechniqueListPage.tsx, + NewTechniqueDialog.tsx
    │       └── editor/
    │           ├── + TechniqueEditorPage.tsx
    │           ├── + editor-state.ts / editor-state.test.ts   # pure reducer + history
    │           ├── + MetaForm.tsx
    │           ├── + StepsPanel.tsx
    │           ├── + JointPanel.tsx
    │           ├── + JointGizmo.tsx    # TransformControls child
    │           ├── + CameraCapture.tsx # useThree child
    │           ├── + PositionDialog.tsx
    │           ├── + ChainsEditor.tsx
    │           ├── + PreviewDialog.tsx
    │           ├── + to-preview.ts / to-preview.test.ts  # editor state -> TechniqueDetail
    │           └── + use-unsaved-guard.ts
    └── ~ pages/HomePage.tsx           # link to /admin (dev only)
```

## Règles pour l'agent `dev`

- Branche `phase-2/contenu`, **un commit par tâche** (message en anglais), `pnpm lint`, `pnpm typecheck`, `pnpm test` verts avant la suivante.
- TypeScript strict, pas de `any`, pas de `as` sauf commentaire justifiant.
- Tout body, param et query admin passe par un schéma `strictObject` de shared ; jamais de body brut vers Prisma.
- Tests d'API : `app.inject` sur la base de test, slugs uniques (`uniqueSlug('t')`) et nettoyage en `afterAll`, car Vitest exécute les fichiers en parallèle. Les requêtes non sûres portent l'en-tête `Origin` de `test-utils`.
- Textes visibles en français ; messages d'erreur de l'API en anglais (le front traduit selon `code`/`reason`).

---

## A. Reprises de la phase 1 (avant l'admin)

### P2-T0. Base de test (Fares, 2 min)

`docker compose exec db createdb -U tatamap tatamap_test`, puis ajouter dans `apps/api/.env` : `TEST_DATABASE_URL=postgresql://tatamap:tatamap@localhost:5432/tatamap_test` (port 5433 sur le poste de Fares, cf. `DB_PORT`). **Fait.**

**Fini quand** : `docker compose exec db psql -U tatamap -l` liste `tatamap_test`.

### P2-T1. Constantes partagées

`packages/shared/src/defaults.ts` (ADR 0003 §A1) ; `timeline.ts`, `TechniqueViewer.tsx`, `seed.ts` et `scissor-sweep.ts` les importent et suppriment leurs copies locales.

**Fini quand** : `grep -rnE "1300|1200|170, 170, 300" apps packages --include=*.ts --include=*.tsx | grep -v test | grep -v defaults.ts | grep -v generated` ne renvoie plus que des données de pose ; tests existants verts.

### P2-T2. `techniqueDetailBaseSchema` et invariants

Refactor de `technique.ts` selon §A2 (exports `labelSchema`, `listItemSchema`, `transitionMsSchema`, `stepTextSchema`, `techniqueDetailBaseSchema`, `isNumberedFrom1`, `hasConsistentEndPosition`, messages). Comportement inchangé.

**Fini quand** : les 6 tests existants de `technique.test.ts` passent sans modification ; nouveaux tests unitaires de `isNumberedFrom1` (`[]`, `[1,2]`, `[2]`, `[1,3]`) et `hasConsistentEndPosition` (4 combinaisons) ; `techniqueDetailBaseSchema.pick({ slug: true })` compile.

### P2-T3. `toStepCreateData` et ordre stable des enchaînements

- `apps/api/src/techniques/step-data.ts` (§A3) ; `seed.ts` construit des `StepInput` et appelle `toStepCreateData`. `StepInput` est d'abord défini dans `packages/shared/src/admin/technique.ts` (seulement `stepInputSchema` à ce stade, le reste arrive en P2-T12).
- `technique-repository.ts` : `orderBy: [{ type: 'asc' }, { to: { name: 'asc' } }, { id: 'asc' }]` sur `chainsFrom`.

**Fini quand** : test unitaire `step-data.test.ts` (ordres 1..n, `skeleton === pose.skeleton`, `techniqueId` partout, aucun autre champ) ; `pnpm db:seed` deux fois de suite → toujours 5 étapes ; test d'intégration : deux enchaînements créés dans le désordre (une alternative puis une suite) reviennent `followup` puis `alternative`.

### P2-T4. Base de test séparée

§B9 : `prisma.config.ts` (variable `PRISMA_TARGET`), `test-setup.ts` exige `TEST_DATABASE_URL` et l'affecte à `DATABASE_URL` (message clair sinon), script racine `db:test:reset`, `.env.example` et CI (`TEST_DATABASE_URL` = `DATABASE_URL` ; l'étape `migrate deploy`/`db:seed` existante suffit puisque c'est la même base).

**Fini quand** : `pnpm db:test:reset && pnpm test` passe ; après `pnpm test`, `psql -d tatamap -c 'select slug from "Technique"'` ne montre aucune technique de test ; sans `TEST_DATABASE_URL`, `pnpm --filter @tatamap/api test` échoue avec un message explicite ; CI verte.

### P2-T5. Client HTTP web

§A5 : `apiRequest`, `apiSend`, `fetchJson` conservé, `credentials: 'include'`, `VITE_API_URL`, `reason` dans `ApiRequestError`, `vite-env.d.ts`.

**Fini quand** : tests Node (`api.test.ts`, `fetch` remplacé par un stub via `vi.stubGlobal`) : GET sans `Content-Type` ; POST avec `Content-Type` et corps JSON ; POST sans `body` → ni en-tête ni corps ; `credentials === 'include'` ; base `VITE_API_URL` préfixée ; 204 → `undefined` ; erreur 409 avec `reason` → `ApiRequestError.reason` ; réseau coupé → `code: 'network'`. La page du ciseau marche toujours.

### P2-T6. Viewer : scène exportée, caméra, `frameloop`

§D1 : `TechniqueScene` (caméra `makeDefault` possédée par la scène, OrbitControls, `view`, `cameraKey`), `TechniqueViewer` = Canvas + scène + `children`, `frameloop` `demand` à l'arrêt avec `invalidate()`, `shouldReapplyPose` pour les changements de `steps` à l'arrêt. `camera.ts` : `frameCamera(view, hint, widthPx)` → `{ projection, position, target, up, zoom? }`. `TechniquePage` : bouton « Recentrer » (incrémente `cameraKey`).

**Fini quand** : tests Node de `frameCamera` (`'step'` sans hint = `DEFAULT_CAMERA` ; `'front'` regarde selon −z vers la cible ; `'top'` a un `up` non colinéaire à la direction de vue ; zoom ortho proportionnel à la largeur) et de `shouldReapplyPose` (à l'arrêt + nouvelle référence de `steps` → vrai ; en lecture → faux ; écho d'`onStepChange` → faux).

**Fares vérifie à l'écran** : le ciseau joue comme avant ; pause, on fait tourner la caméra, « Recentrer » ramène l'angle conseillé ; en pause, le ventilateur/CPU se calme (Moniteur d'activité : l'onglet ne consomme plus en continu).

### P2-T7. Viewer : sélection d'articulation et fantôme

`FighterMesh` : `onJointPointerDown` (avec `stopPropagation`), surbrillance de `selectedJoint`, `variant: 'solid' | 'ghost'`. `TechniqueScene` : `onJointPointerDown`, `selectedJoint`, `ghostPose`. La vérification visuelle se fait avec l'éditeur (P2-T24) : pas de page de test.

**Fini quand** : typecheck vert ; aucune régression des tests ; la page publique ne passe aucune de ces props (pas de picking ni de curseur main sur le site public).

**Fares vérifie à l'écran** (après P2-T24) : un clic sur une sphère la met en surbrillance ; le fantôme est transparent et non cliquable.

---

## B. Sécurité et authentification

### P2-T8. Configuration, durcissement Fastify, contrôle d'`Origin`

Installer `@fastify/helmet@~13.2.0`. `env.ts` (§B8) + `toAppConfig(env)` ; `buildApp({ prisma, config })` ; `Fastify({ bodyLimit: 262144, trustProxy, logger: { level, redact } })` ; helmet (§B7) ; hook global `origin-check.ts` (§B5) ; `test-utils.ts` (`testConfig()` avec un secret de test de 48 octets, `WEB_ORIGINS=http://localhost:5173`, `ORIGIN`) ; mise à jour des tests et de `server.ts`.

**Fini quand** (tests) :
- `loadEnv` refuse : `JWT_SECRET` absent ou de 31 octets, `WEB_ORIGINS` vide ou non-URL, `COOKIE_SECURE=false` avec `NODE_ENV=production` ; accepte la config de `.env.example` complétée ;
- `pnpm --filter @tatamap/api dev` sans `JWT_SECRET` → l'API ne démarre pas (message Zod sur `JWT_SECRET`) ;
- `GET /api/health` porte `x-content-type-options: nosniff` et une `content-security-policy` avec `default-src 'none'` ;
- un `POST` de 300 Kio → `413 payload_too_large` ;
- `POST /api/nope` sans `Origin` → `403 forbidden` ; avec `Origin: http://evil.test` → `403` ; avec `ORIGIN` → `404` ; `GET` sans `Origin` → passe.

### P2-T9. Migration `phase2_admin` et raisons d'erreur

`Technique.version Int @default(1)` ; `prisma migrate dev --create-only --name phase2_admin`, ajout à la main du `CHECK Chain_no_self_link` (§A4), puis `migrate dev`. Seed : `version: { increment: 1 }` dans l'`update`. Shared : `API_ERROR_REASONS`, `reason` optionnel (§C3) ; `sendApiError(…, reason?)`.

**Fini quand** : `prisma migrate status` à jour sur les deux bases ; test d'intégration : `prisma.chain.create` avec `fromId === toId` lève une erreur de contrainte ; `apiErrorSchema` accepte une erreur avec et sans `reason`, refuse une `reason` inconnue.

### P2-T10. Mots de passe et création du compte admin

Installer `@node-rs/argon2@~2.2.2`. `auth/password.ts` (§B3). `scripts/create-admin.ts` (§B2), script racine `admin:create`, entrée tsdown. Shared : `admin/auth.ts`.

**Fini quand** :
- test : le hash commence par `$argon2id$v=19$m=19456,t=2,p=1$` ; `verifyPassword(hash, bon)` vrai, mauvais faux ; `verifyPassword(null, x)` faux et prend un temps du même ordre (> 50 % du temps d'un vrai `verify`) ;
- `pnpm admin:create fares@exemple.fr` demande le mot de passe deux fois sans l'afficher, refuse 11 caractères et deux saisies différentes, puis crée l'admin ; relancer la commande change le mot de passe (toujours 1 ligne dans `Admin`) ;
- `pnpm build` produit `apps/api/dist/create-admin.js`.

### P2-T11. Login, logout, plugin admin

Installer `@fastify/cookie@~11.1.3`, `@fastify/jwt@~10.2.5`, `@fastify/rate-limit@~11.2.1`. `routes/auth.ts`, `auth/session.ts`, `auth/admin-plugin.ts` (préfixe `/api/admin`, hook `onRequest`, `onSend` `no-store`, renouvellement glissant, `request.admin`), `routes/admin/me.ts`. Contrat : §B4 et §C4.

**Fini quand** (tests `auth.test.ts`) :
- login correct → `200 { email }`, `set-cookie` contient `__Host-tatamap_session=`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age=7200` ; avec `cookieSecure: false` → nom `tatamap_session`, sans `Secure` ;
- mauvais mot de passe et email inconnu → même `401` et même corps ;
- body avec un champ en plus → `400` ;
- 6e tentative en 15 min (app dédiée au test) → `429 rate_limited` ;
- `GET /api/admin/me` sans cookie → `401` + `cache-control: private, no-store` ; avec le cookie → `200` ;
- jeton signé `HS512`, jeton `alg: none`, jeton expiré, jeton d'un admin supprimé, jeton signé avec un autre secret → `401` ;
- jeton à qui il reste 50 min → la réponse réémet un cookie ; à qui il reste 1 h 30 → non ;
- logout → `204`, cookie avec `Max-Age=0` ;
- logs capturés (flux pino en mémoire, niveau `trace`) pendant un login avec le mot de passe `canary-S3cret-pw` : la chaîne n'apparaît nulle part ;
- `curl -i -X POST localhost:3000/api/auth/login -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' -d '{"email":"…","password":"…"}'` montre le cookie.

> **Revue `cybersecu` n° 1** (après P2-T11, avant d'écrire la moindre route d'écriture) : env et secret, argon2id et hash factice, JWT (algorithme, iss/aud, expiration, renouvellement), cookie, contrôle d'`Origin`, rate-limit et `trustProxy`, helmet, `bodyLimit`, logs, script `create-admin`. Les correctifs passent avant P2-T12.

---

## C. API d'écriture

### P2-T12. Schémas d'écriture partagés

Shared : `slug.ts`, `admin/common.ts`, `admin/technique.ts` (complet), `admin/publish.ts`, `admin/position.ts`, `admin/tag.ts` (§C3).

**Fini quand** (tests) :
- `slugify` : « Ciseau depuis la garde fermée » → `ciseau-depuis-la-garde-fermee` ; « Clé de bras (armbar) » → `cle-de-bras-armbar` ; « Œil » → `oeil` ; « --a  b-- » → `a-b` ; 150 caractères → ≤ 100 et sans tiret final ; le résultat passe `slugSchema` dès qu'il fait ≥ 2 caractères ;
- `techniqueUpdateInputSchema` : accepte une technique valide (poses de la fixture) ; refuse soumission + `endPositionId`, renversement sans arrivée, tag en double, enchaînement en double, 0 étape, 41 étapes, une étape avec `order`, un champ inconnu à la racine, `version: 0`, un titre d'espaces seulement ; trimme les titres ;
- `adminTechniqueSchema` accepte une sortie type (dates ISO) ;
- `publishIssues` : 1 étape + 0 point clé → 2 messages ; 2 étapes + 1 point → `[]`.

### P2-T13. Utilitaires de pose

Shared : `pose/edit.ts`, `pose/starter-pose.ts` (§C3).

**Fini quand** (tests) : `mirrorPose(mirrorPose(p))` égal à `p` ; `mirrorPose` échange `handL`/`handR` et inverse z, y compris la caméra ; `clampVec3([0, -5, 900])` → `[0, 0, 400]` ; `boneLengths` du `STARTER_POSE` : 9 os, `neck-hip` = 45 ; `poseWarnings(p, p)` vide ; avant-bras allongé de 20 % → 1 avertissement, de 10 % → aucun ; `STARTER_POSE` passe `currentPoseSchema` et `opponent.handL[2] === -me.handL[2]`.

### P2-T14. Routes admin en lecture

`admin-technique-repository.ts`, `to-admin-technique.ts` (poses via `poseSchema` + `upgradePose`, sortie parsée par `adminTechniqueSchema`), `GET /api/admin/techniques`, `GET /api/admin/techniques/:id`, `GET /api/admin/positions`, `GET /api/admin/tags`.

**Fini quand** (tests, connecté) : la liste contient le ciseau (`stepCount: 5`, `status: 'published'`) et un brouillon créé par le test ; le détail du ciseau passe `adminTechniqueSchema`, 5 étapes, `version ≥ 1` ; id inconnu → `404` ; id `pas-un-uuid` → `400` ; non connecté → `401` sur les 4 routes ; `cache-control: private, no-store` partout.

### P2-T15. Positions et tags

`POST`/`PUT /api/admin/positions`, `POST /api/admin/tags` (`position-write.ts` : mapping explicite des champs).

**Fini quand** (tests) : création → `201` puis visible dans `GET` ; slug existant → `409 slug_taken` ; `PUT` renomme ; `PUT` d'un id inconnu → `404` ; corps avec `id` en plus → `400` ; sans `Origin` → `403` ; non connecté → `401`.

### P2-T16. Création d'une technique

`POST /api/admin/techniques` (`technique-write.ts` : `createTechnique`) : slug fourni ou `slugify(name)`, 1 étape `STARTER_POSE`, statut `draft`.

**Fini quand** (tests) : `201`, réponse `adminTechniqueSchema`, `status: 'draft'`, `version: 1`, 1 étape ; slug absent → généré depuis le nom ; nom qui donne un slug < 2 caractères (« ! ») → `400` ; slug pris → `409 slug_taken` ; `startPositionId` inconnu → `400 unknown_reference` ; soumission avec arrivée → `400` ; `GET /api/techniques/<slug>` public → `404` (brouillon).

### P2-T17. PUT d'une technique

`updateTechnique` selon l'ordre de §C4 (transaction interactive, `toTechniqueWriteData`, `toStepCreateData`).

**Fini quand** (tests) :
- PUT complet (3 étapes, 1 tag, 1 enchaînement vers le ciseau) → `200`, `version` + 1, le GET admin renvoie exactement ce qui a été envoyé (ordre des étapes compris) ;
- même `version` renvoyée deux fois → la seconde donne `409 version_mismatch` ;
- deux PUT concurrents (`Promise.all`) avec la même version → un `200` et un `409` ;
- enchaînement vers soi-même → `400 self_chain` ; tag inconnu → `400 unknown_reference` ;
- slug d'une autre technique → `409 slug_taken` ;
- sur le ciseau (publié) : changer le slug → `409 slug_locked` ; passer à 1 étape → `409 not_publishable` ; changer un titre → `200` et visible sur `GET /api/techniques/ciseau-garde-fermee` ;
- pose avec une articulation en trop, ou y négatif → `400`, rien n'a changé en base (relecture) ;
- un enchaînement vers un brouillon est stocké mais absent de la réponse publique.

Remettre le ciseau dans son état seedé en fin de test (ou travailler sur une copie dupliquée en base de test).

### P2-T18. Publier, dépublier, dupliquer, supprimer

**Fini quand** (tests) :
- brouillon d'1 étape → publish `409 not_publishable` ; après PUT à 2 étapes + 1 point clé → publish `200`, `publishedAt` posé, visible en public ; republish → `200`, `publishedAt` inchangé ;
- unpublish → `200`, `404` en public, `publishedAt` conservé ;
- publish/unpublish avec une version périmée → `409 version_mismatch` ;
- duplicate du ciseau → `201`, brouillon `ciseau-garde-fermee-copie`, 5 étapes identiques, mêmes tags, aucun enchaînement ; second duplicate → `…-copie-2` ;
- DELETE d'un publié → `409 still_published` ; d'un brouillon → `204` puis `404` ; ses étapes et enchaînements ont disparu (cascade).

> **Revue `cybersecu` n° 2** (après P2-T18) : mass assignment (aucun spread de body vers Prisma), validation de toutes les entrées admin, taille des poses, filtre `published` sur toutes les routes publiques (y compris les enchaînements), absence de fuite d'ids ou de brouillons côté public, gestion des erreurs Prisma (pas de 500 sur une erreur de saisie), transactions, `no-store`. Correctifs avant la partie D.

### P2-T19. Export et import du contenu

Shared : `content.ts` (`contentTechniqueSchema`, `contentPositionSchema`, `contentTagSchema`, par slugs). Scripts `content-export.ts`, `content-import.ts`, scripts racine `content:export` / `content:import` (base `DATABASE_URL`, dossier `CONTENT_DIR`, défaut `content/` à la racine ; le dossier doit exister, sinon message clair indiquant de cloner `Fares30-coder/tatamap-content` dans `content/`). Ne rien commiter dans `content/` depuis le repo public : il est ignoré. JSON trié (positions et tags par slug, techniques un fichier par slug), indentation 2, retour à la ligne final.

**Fini quand** : sur la base de test, `export` → `reset` → `import` → `export` produit des fichiers **identiques** (test d'intégration avec un dossier temporaire) ; `import` lancé deux fois ne crée aucun doublon ; un fichier invalide (pose à 10 articulations) fait échouer l'import sans rien écrire ; `pnpm content:export` sur la base locale produit `content/techniques/ciseau-garde-fermee.json`.

---

## D. Admin web

### P2-T20. Connexion et squelette admin

Routes lazy `/admin/*` (§D3), `LoginPage`, `RequireAdmin`, `AdminLayout` (en-tête, « Se déconnecter »), `features/admin/api.ts` (hooks : `useAdminSession`, `useLogin`, `useLogout`, puis ceux des techniques/positions/tags ; aucune requête admin mise en cache au-delà de la session : `queryClient.clear()` au logout). `safe-next.ts` : n'accepte que les chemins commençant par `/admin` (pas de `//`, pas d'URL absolue).

**Fini quand** : tests Node de `safeNext` (`/admin/techniques/x` ok ; `//evil.test`, `https://evil.test`, `/techniques/x`, `/admin\\@evil` → défaut) ; `pnpm build` : le chunk principal ne contient pas `TransformControls` (`grep -L TransformControls apps/web/dist/assets/index-*.js`).

**Fares vérifie à l'écran** : `/admin/techniques` non connecté → redirige vers le login ; mauvais mot de passe → « Identifiants invalides » ; bon → arrive sur la liste ; « Se déconnecter » → retour au login, et le bouton Précédent ne réaffiche pas la liste ; DevTools > Application > Cookies : `__Host-tatamap_session` est `HttpOnly` (non visible par `document.cookie`).

### P2-T21. Liste admin et création

`AdminTechniqueListPage`, `NewTechniqueDialog` (slug pré-rempli par `slugify(name)` tant que Fares ne l'a pas touché ; arrivée désactivée si « Soumission »), Dupliquer, Supprimer (brouillons, `confirm`), Voir (publiées).

**Fini quand** : typecheck et lint verts.

**Fares vérifie à l'écran** : le ciseau apparaît « Publié » ; créer « Clé de bras depuis la garde fermée » ouvre l'éditeur ; dupliquer le ciseau crée « … (copie) » en brouillon ; supprimer la copie la retire ; « Supprimer » n'est pas proposé sur le ciseau.

### P2-T22. État de l'éditeur (logique pure)

`editor-state.ts` : `EditorState = { technique: AdminTechnique (sans id/status/dates), stepIndex, selectedJoint, history: { past, future }, revision, savedRevision }` et un réducteur pur. Actions : `loaded`, `setMeta`, `selectStep`, `addStepAfter` (copie la pose), `removeStep`, `moveStep`, `setStepField`, `beginJointDrag`, `setJoint` (avec `clampVec3`), `endJointDrag`, `copyPreviousPose`, `mirror` (`'step' | 'all'`), `setStepCamera`, `selectJoint`, `undo`, `redo`, `saved`. Sélecteurs : `isDirty`, `toUpdateInput(state)` (parsable par `techniqueUpdateInputSchema`), `currentWarnings`, `currentPublishIssues`.

**Fini quand** (tests Node) : `addStepAfter` insère une copie profonde (modifier la nouvelle ne touche pas l'ancienne) ; `removeStep` de la dernière étape restante → état inchangé ; `moveStep` déplace et suit `stepIndex` ; un glisser (`begin` + 30 `setJoint` + `end`) = **une** entrée d'annulation ; `undo`/`redo` restaurent exactement ; `setJoint` hors bornes est borné ; passer la catégorie à `submission` met `endPositionId` à `null` ; `isDirty` faux après `saved`, vrai après une modification, faux à nouveau après `undo` jusqu'à l'état sauvegardé ; `toUpdateInput` passe le schéma pour un état chargé depuis la fixture.

### P2-T23. Page de l'éditeur : formulaire, étapes, enregistrement

`TechniqueEditorPage` (chargement `GET`, réducteur), `MetaForm` (nom, slug — désactivé si publié, avec l'explication —, catégorie, niveau, gi, départ, arrivée, points clés, erreurs fréquentes), `StepsPanel` (liste, titre, texte, transition, ajouter/supprimer/monter/descendre), viewer en lecture seule pour l'instant, Enregistrer + `Ctrl/Cmd+S`, `use-unsaved-guard.ts` (`beforeunload` + `useBlocker`), gestion `401` / `409 version_mismatch` / `409 slug_taken` / `409 slug_locked` / `409 not_publishable` / `400` (messages §D2). Validation locale avec `techniqueUpdateInputSchema` avant l'envoi (erreurs affichées près des champs).

**Fini quand** : typecheck et lint verts.

**Fares vérifie à l'écran** : modifier le titre d'une étape → « Modifications non enregistrées » ; quitter la page → confirmation ; `Cmd+S` → enregistré, indicateur disparu ; deux onglets sur la même technique, enregistrer dans le premier puis dans le second → message de conflit ; changer le slug du ciseau → refusé avec explication.

### P2-T24. Édition 3D

`JointGizmo` (TransformControls, `translationSnap={1}`, `begin`/`setJoint`/`end`), sélection par clic (`onJointPointerDown`) et par le `JointPanel` (22 boutons, x/y/z numériques, flèches ± 1, Maj ± 10), `Échap` désélectionne, boutons de vue 3D / Face / Profil / Dessus (`view` + `cameraKey`), `CameraCapture` + « Utiliser cet angle pour l'étape » / « Retirer l'angle ».

**Fini quand** : typecheck et lint verts.

**Fares vérifie à l'écran** : cliquer sur la main gauche de `me` la sélectionne et affiche la flèche 3 axes ; la tirer déplace la main et le cylindre suit ; la caméra ne tourne pas pendant le glisser ; impossible de passer sous le tatami ; en vue Profil, la vue est orthographique et le placement suit la souris au centimètre ; saisir `y = 100` dans le panneau déplace la sphère ; « Utiliser cet angle » puis enregistrer : à la réouverture et sur la page publique, l'étape s'ouvre avec cet angle.

### P2-T25. Aides à la saisie

Fantôme de l'étape précédente (case), « Copier la pose de l'étape précédente », « Miroir » (étape / toutes), liste des avertissements de longueurs d'os (libellés FR des os : « bras gauche », « avant-bras droit », « cuisse », « tibia », « buste »), annuler/rétablir (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Maj+Z`), Lecture/Pause des étapes non enregistrées.

**Fini quand** : typecheck et lint verts ; test Node de la table des libellés (9 os couverts).

**Fares vérifie à l'écran** : ajouter une étape → même pose que la précédente, fantôme superposé ; étirer un tibia → avertissement ; `Cmd+Z` annule le glisser entier en une fois ; Miroir sur toutes les étapes du ciseau → la technique se joue de l'autre côté ; Lecture joue les poses non enregistrées.

### P2-T26. Positions, tags, enchaînements

`PositionDialog` (création et modification depuis les selects, slug auto), tags (cases + « Nouveau tag »), `ChainsEditor` (type + cible, technique courante exclue, brouillons marqués).

**Fini quand** : typecheck et lint verts.

**Fares vérifie à l'écran** : créer la position « Contrôle latéral » depuis le select Arrivée → sélectionnée automatiquement ; créer un tag ; ajouter un enchaînement « Suite » vers le ciseau ; enregistrer, recharger : tout est conservé.

### P2-T27. Aperçu et publication

Extraire `TechniqueView` de `TechniquePage` (même rendu public, données en props). `to-preview.ts` : état de l'éditeur + positions + tags → `TechniqueDetail` (enchaînements résolus en résumés). `PreviewDialog`. Boutons Publier / Dépublier / Supprimer avec la liste `publishIssues`.

**Fini quand** : test Node `to-preview.test.ts` (le résultat passe `techniqueDetailSchema` ; `order` 1..n ; soumission → `endPosition: null`) ; la page publique du ciseau est identique à avant (vérif visuelle).

**Fares vérifie à l'écran** : « Aperçu » sur un brouillon montre la page telle qu'elle sera publiée, modifications non enregistrées comprises ; « Publier » est grisé tant qu'il manque un point clé (message affiché) ; après publication, `/techniques/<slug>` répond ; « Dépublier » → la page publique affiche « Technique introuvable ».

### P2-T28. Documentation et PR

README : variables d'env, `admin:create`, `db:test:reset`, `content:export`/`import`, mise en garde « `pnpm db:reset` efface le contenu local : exporter avant ». `CLAUDE.md` déjà mis à jour avec le texte de l'ADR 0003 (accepté). PR `phase-2/contenu` → `main` (le critère de phase n'est pas requis pour merger l'outil : la saisie des 15 techniques peut se faire sur `main`).

**Fini quand** : `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verts, CI verte, revue `architecte` (respect de l'ADR 0003) faite.

---

## Critère de la phase

**15 techniques publiées** (le ciseau compte), visibles sur `/techniques/<slug>`, exportées dans `content/` et poussées sur le repo privé `tatamap-content`.

## Ce dont Fares a besoin pour saisir ses 15 techniques

### Avant de commencer
1. `pnpm admin:create <ton-email>` (une fois).
2. Une **liste sur papier** : les positions (nœuds de la carte) et les 15 techniques avec départ, arrivée, catégorie, 4 à 7 étapes titrées. Rappel de l'ADR 0002 : le rôle d'une position est vu **depuis `me`** ; la même situation vue des deux côtés fait donc deux positions (ex. « Garde fermée » = tu es dessous ; « Dans la garde fermée » = tu es dessus, utile pour les passages). Viser un petit graphe connexe (garde fermée, montée, contrôle latéral, dos, demi-garde, debout) : la carte de la phase 3 sera plus parlante.
3. Une référence visuelle par technique : ta propre vidéo (ou un partenaire) au ralenti, mise en pause à chaque étape.

### Pour chaque technique (compter 45 à 90 min les premières fois, puis 30 à 45)
1. **Partir du plus proche** : dupliquer une technique qui part de la même position (le ciseau pour tout ce qui part de la garde fermée) plutôt que créer de zéro ; sinon « Nouvelle technique » (deux combattants debout).
2. Renseigner nom, catégorie, niveau, gi, départ, arrivée (créer la position au besoin), tags.
3. **Étape 1 d'abord, soignée** : elle sert de référence pour les longueurs d'os de toutes les autres. Placer le buste (cou, hanche) puis les membres, en vue **Profil**, puis **Dessus** pour la profondeur (gauche/droite), puis vérifier en **3D**.
4. Étapes suivantes : « Ajouter une étape » (copie de la précédente), ne bouger que ce qui change, en s'aidant du fantôme. Corriger tant qu'il y a des avertissements de longueur d'os importants.
5. Régler la durée de transition des étapes rapides/lentes, et « Utiliser cet angle » sur les étapes où la vue par défaut cache l'action.
6. **Lecture** dans l'éditeur ; corriger les mouvements qui traversent l'adversaire (ajouter une étape intermédiaire plutôt que tordre une pose).
7. Titres d'étapes, points clés (≥ 1), erreurs fréquentes, enchaînements.
8. `Cmd+S` souvent. **Aperçu**, puis **Publier**.
9. Si la technique se fait des deux côtés, ne pas la dupliquer : une seule technique suffit (« Miroir » sert si tu l'as saisie du mauvais côté).

### Sauvegarde
- `pnpm content:export` puis, **après chaque séance** de saisie : `git -C content add -A && git -C content commit -m "..." && git -C content push` (repo privé `tatamap-content`).
- Ne jamais lancer `pnpm db:reset` sans export préalable (il efface la base locale ; `pnpm content:import` restaure).

### Validation
- Après 5 techniques : montrer à un partenaire d'entraînement, noter ce qui n'est pas lisible (angles, vitesse, nombre d'étapes), ajuster la méthode avant les 10 suivantes.

## Prochaines actions

1. **Fares** : relire et accepter (ou amender) l'ADR 0003, en particulier les points listés dans « À trancher » du compte rendu ; P2-T0.
2. **dev** : P2-T1 → P2-T28 dans l'ordre, un commit par tâche.
3. **cybersecu** : revue n° 1 après P2-T11, revue n° 2 après P2-T18, puis revue de la PR finale (dépendances : `pnpm audit`).
4. **architecte** : revue de la PR de phase 2, puis ADR 0004 (bibliothèque publique, carte, PWA, déploiement — dont la même origine front/API décidée en ADR 0003 §B6).
