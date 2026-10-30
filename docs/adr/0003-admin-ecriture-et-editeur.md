# ADR 0003 — Admin : authentification, API d'écriture et éditeur de poses

- Statut : accepté
- Date : 2026-10-28
- Auteur : agent architecte (pour Fares Haouari)
- Dépend de : ADR 0001 (outillage), ADR 0002 (modèle de données, format de pose `v1-11`)
- Portée : phase 2 « Contenu » (critère : *15 techniques publiées*)

## Contexte

La phase 1 est mergée : `GET /api/techniques/:slug` sert le ciseau, le viewer R3F l'anime. La phase 2 doit permettre à Fares de **saisir lui-même** une quinzaine de techniques : connexion admin, API d'écriture, éditeur de poses, aperçu, publication.

Contraintes : un seul admin, projet solo, pas de déploiement en phase 2 (l'admin tourne en local ; le déploiement est en phase 3), mais tout ce qui touche à la sécurité doit être prêt pour la prod dès maintenant (revue cybersécu de la phase 1).

Hors périmètre : bibliothèque publique (`GET /api/techniques?…`, `/api/positions`, `/api/tags`, `/api/graph`), carte, PWA, CORS, déploiement.

Versions vérifiées sur le registre npm le 2026-10-28 (section « Versions » en fin de document).

---

## Partie A — Reprises des revues de la phase 1

### A1. Constantes partagées

Nouveau fichier `packages/shared/src/defaults.ts`, seule source de ces valeurs (le viewer, le seed, l'éditeur et l'API les importent) :

```ts
import type { CameraHint } from './pose/skeleton-v1-11';

/** Camera used when a step has no camera hint. */
export const DEFAULT_CAMERA: CameraHint = { position: [170, 170, 300], target: [0, 40, 20] };
/** Default duration of the transition into a step (mirrors Step.transitionMs @default(1300) in Prisma). */
export const DEFAULT_TRANSITION_MS = 1300;
/** How long each step is held during playback. */
export const DEFAULT_HOLD_MS = 1200;
```

`timeline.ts` réexporte ou importe `DEFAULT_HOLD_MS` depuis shared (suppression de la constante locale), `TechniqueViewer.tsx` supprime son `DEFAULT_CAMERA` local, le seed remplace `CAMERA` et `STEP_TRANSITION_MS` par ces constantes. Le `@default(1300)` Prisma reste (Prisma ne peut pas importer une constante TS) ; un test dans `enums-sync.test.ts` n'est pas possible sur un default, on se contente d'un commentaire croisé.

### A2. Schéma de détail dérivable et invariants réutilisables

`techniqueDetailSchema` actuel est un `ZodObject` enveloppé par deux `.refine` : on ne peut plus en dériver (`.pick`, `.extend`, `.shape`). On sépare la forme et les invariants :

```ts
// packages/shared/src/technique.ts (refactor, behaviour unchanged)
export const labelSchema = z.string().min(1).max(120);
export const listItemSchema = z.string().min(1).max(300);
export const transitionMsSchema = z.int().min(100).max(10_000);
export const stepTextSchema = z.string().max(2000);

export const stepSchema = z.strictObject({
  order: z.int().min(1),
  title: labelSchema,
  text: stepTextSchema,
  transitionMs: transitionMsSchema,
  pose: currentPoseSchema,
});

/** Shape only, no refinement: safe to .pick / .extend / spread .shape. */
export const techniqueDetailBaseSchema = z.strictObject({
  ...techniqueSummarySchema.shape,
  keyPoints: z.array(listItemSchema).max(20),
  commonMistakes: z.array(listItemSchema).max(20),
  startPosition: positionSummarySchema,
  endPosition: positionSummarySchema.nullable(),
  tags: z.array(tagSchema),
  steps: z.array(stepSchema).min(1).max(40),
  chains: z.array(chainSchema),
});

// ---- Invariants, shared by read (detail) and write (admin) schemas ----

/** Steps are sorted and numbered 1..n. */
export const isNumberedFrom1 = (steps: ReadonlyArray<{ order: number }>): boolean =>
  steps.every((s, i) => s.order === i + 1);

/** A submission has no end position; any other category has one. */
export const hasConsistentEndPosition = (category: Category, hasEndPosition: boolean): boolean =>
  (category === 'submission') !== hasEndPosition;

export const STEPS_NUMBERED_MESSAGE = 'steps must be sorted and numbered 1..n';
export const END_POSITION_MESSAGE = 'a submission has no end position, any other category has one';

export const techniqueDetailSchema = techniqueDetailBaseSchema
  .refine((t) => isNumberedFrom1(t.steps), { message: STEPS_NUMBERED_MESSAGE, path: ['steps'] })
  .refine((t) => hasConsistentEndPosition(t.category, t.endPosition !== null), {
    message: END_POSITION_MESSAGE,
    path: ['endPosition'],
  });
```

En écriture (partie C), les étapes **n'ont pas de champ `order`** : l'ordre est l'index dans le tableau, et l'API écrit `order = i + 1`. L'invariant « numérotées 1..n » est donc garanti par construction (par `toStepCreateData`, A3) au lieu d'être vérifié ; il n'existe aucun moyen d'envoyer une numérotation incohérente. L'invariant de position d'arrivée est réutilisé tel quel.

### A3. Helper unique `toStepCreateData`

Fichier `apps/api/src/techniques/step-data.ts`, utilisé par le seed (`prisma/seed.ts`), le PUT admin, la création, la duplication et l'import de contenu :

```ts
import type { StepInput } from '@tatamap/shared';
import type { Prisma } from '../generated/prisma/client';

/** The only place that turns validated steps into rows. Order = array index + 1; `skeleton` mirrors pose.skeleton. */
export function toStepCreateData(
  techniqueId: string,
  steps: ReadonlyArray<StepInput>,
): Prisma.StepCreateManyInput[] {
  return steps.map((step, i) => ({
    techniqueId,
    order: i + 1,
    title: step.title,
    text: step.text,
    transitionMs: step.transitionMs,
    skeleton: step.pose.skeleton,
    pose: step.pose,
  }));
}
```

Pas de cast `any` : si TypeScript refuse `pose` comme `InputJsonValue`, passer par une fonction `toJson(pose: CurrentPose): Prisma.InputJsonObject` documentée, au même endroit.

### A4. Enchaînements : ordre stable, pas de boucle sur soi-même

- Lecture publique et admin : `chainsFrom: { …, orderBy: [{ type: 'asc' }, { to: { name: 'asc' } }, { id: 'asc' }] }`. L'ordre `type` suit l'ordre de déclaration de l'enum PostgreSQL (suite, contre, alternative).
- Self-link interdit à trois niveaux : (1) l'API renvoie `400` `reason: self_chain` ; (2) l'éditeur exclut la technique courante de la liste des cibles ; (3) contrainte SQL ajoutée à la main dans la migration de phase 2 :
  ```sql
  ALTER TABLE "Chain" ADD CONSTRAINT "Chain_no_self_link" CHECK ("fromId" <> "toId");
  ```
  (Prisma ne modélise pas les `CHECK` et ne cherche pas à les supprimer.)

### A5. Client HTTP web

`apps/web/src/lib/api.ts` devient :

```ts
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal };

/** Sends a request and validates the JSON response with `schema`. Throws ApiRequestError. */
export function apiRequest<S extends z.ZodType>(path: string, schema: S, options?: RequestOptions): Promise<z.output<S>>;
/** Same, for 204 responses (no body). */
export function apiSend(path: string, options: RequestOptions): Promise<void>;
/** Kept for existing callers: apiRequest with GET. */
export const fetchJson = (path, schema, init?) => apiRequest(path, schema, { signal: init?.signal });
```

- `fetch(API_BASE + path, { method, credentials: 'include', headers, body, signal })`.
- `Content-Type: application/json` et `JSON.stringify(body)` **seulement si `body !== undefined`** (Fastify refuse un corps JSON vide : `POST …/duplicate` et `/logout` partent sans en-tête ni corps).
- `ApiRequestError` gagne `reason?: ApiErrorReason` (C4).
- `VITE_API_URL` est **vide par défaut** (même origine : proxy Vite en dev, réécriture `/api/*` chez l'hébergeur en prod, cf. B6). Déclarer `interface ImportMetaEnv { readonly VITE_API_URL?: string }` dans `apps/web/src/vite-env.d.ts`. Aucun secret dans une variable `VITE_*`.

### A6. Viewer réutilisable

Contrat complet en partie D. Décision sur les vignettes (implémentation en phase 3) en D4.

---

## Partie B — Authentification et sécurité

### B1. Préfixe des routes admin : `/api/admin/*` (écart avec CLAUDE.md)

**Décision.** Toutes les routes protégées vivent sous `/api/admin`, enregistrées dans **un seul plugin Fastify encapsulé** (`register(adminPlugin, { prefix: '/api/admin' })`). Ce plugin pose, une seule fois : le hook d'authentification (`onRequest`), l'en-tête `Cache-Control: private, no-store` (`onSend`). Aucune route admin n'est déclarée hors de ce plugin.

Pourquoi : (1) un hook unique et impossible à oublier sur une nouvelle route ; (2) l'admin a besoin de **lectures** différentes du public (brouillons, ids, versions) : `GET /api/techniques/:slug` (public, slug, publié seulement) et `GET /api/admin/techniques/:id` (tout statut) ne peuvent pas partager l'URL ; (3) règles simples côté hébergeur/service worker (« ne jamais cacher `/api/admin/*` »). L'authentification reste sous `/api/auth/*` (le login est forcément hors du hook). Texte de modification de `CLAUDE.md` en fin de document.

### B2. Compte admin : script CLI, pas d'inscription

**Décision.** `pnpm admin:create <email>` → `apps/api/scripts/create-admin.ts` : demande le mot de passe deux fois **sans écho** (TTY), exige 12 à 256 caractères, hache en argon2id, fait un `upsert` par email (la même commande sert à changer le mot de passe). Hors TTY uniquement (shell de l'hébergeur), lecture de `ADMIN_PASSWORD` dans l'environnement, avec un avertissement. Pas de création via le seed (le seed tourne en CI et ne doit contenir aucun identifiant), pas de route d'inscription. Le script est une entrée tsdown de plus (`dist/create-admin.js`) pour pouvoir l'exécuter en prod.

### B3. Mots de passe : argon2id avec `@node-rs/argon2`

**Décision.** `@node-rs/argon2@~2.2.2` plutôt que `argon2` : binaires précompilés livrés en `optionalDependencies` (pas de script d'installation, rien à ajouter à `allowBuilds` de pnpm, pas de node-gyp), API async.

```ts
// apps/api/src/auth/password.ts
import { hash, verify } from '@node-rs/argon2';

// OWASP 2026 baseline for argon2id. Do NOT pass `algorithm`: its type is an ambient `const enum`,
// unusable with isolatedModules; argon2id is the library default.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

/** Constant-time-ish: when the admin is unknown, verify against a dummy hash anyway. */
export async function verifyPassword(storedHash: string | null, password: string): Promise<boolean>;
```

Le hash factice est calculé une fois au démarrage (`hashPassword(randomBytes(32).toString('hex'))`). Un test vérifie que le hash commence par `$argon2id$v=19$m=19456,t=2,p=1$`.

### B4. Jeton : JWT HS256 en cookie HttpOnly

**Décision.** `@fastify/jwt@~10.2.5` + `@fastify/cookie@~11.1.3`.

- Algorithme **HS256 uniquement** à la signature et à la vérification (`verify.algorithms: ['HS256']`), `iss: 'tatamap-api'`, `aud: 'tatamap-admin'`, `sub` = id de l'admin.
- Durée : **2 h**, renouvellement glissant : si l'admin fait une requête authentifiée alors qu'il reste moins d'1 h, le hook réémet le cookie. Une session d'édition active ne tombe donc jamais ; une session abandonnée expire en 2 h. Pas de refresh token.
- Cookie : nom `__Host-tatamap_session` (préfixe `__Host-` : impose `Secure`, `Path=/`, pas de `Domain`), `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age=7200`. Le JWT n'est **jamais** lisible par le JS du front ni stocké en `localStorage`.
- Le hook vérifie le JWT **puis** que l'admin existe encore en base (`findUnique` par id) : supprimer l'admin révoque immédiatement. Rotation de `JWT_SECRET` = déconnexion globale.
- Exception de dev : `COOKIE_SECURE=false` (cookie sans `Secure` et sans préfixe, nom `tatamap_session`) seulement si le navigateur refuse un cookie `Secure` sur `http://localhost` (Safari). Chrome et Firefox l'acceptent : garder `true`. L'API **refuse de démarrer** avec `COOKIE_SECURE=false` quand `NODE_ENV=production`.

```ts
// apps/api/src/app.ts (extract)
await app.register(fastifyCookie);
await app.register(fastifyJwt, {
  secret: config.jwtSecret,
  sign: { algorithm: 'HS256', expiresIn: '2h', iss: 'tatamap-api', aud: 'tatamap-admin' },
  verify: { algorithms: ['HS256'], allowedIss: 'tatamap-api', allowedAud: 'tatamap-admin' },
  cookie: { cookieName: config.cookieName, signed: false },
});
// expiresIn as a string on purpose: a number would be read as milliseconds by fast-jwt.
```

Le payload vérifié est re-parsé avec Zod (`{ sub: z.uuid(), iat: z.int(), exp: z.int() }`, objet non strict car fast-jwt ajoute `iss`/`aud`) avant usage.

**Cookie « appareil de confiance » (ajouté après la revue cybersécurité n° 2).** Le plafond de 20 échecs par compte (`login-limiter.ts`) permettait à quiconque connaît l'email de l'admin de le bloquer volontairement pendant une heure. Après une connexion réussie, l'API pose `__Host-tatamap_device` (`tatamap_device` si `COOKIE_SECURE=false`) : un JWT HS256 (même secret, `iss`/`aud`) de `typ: 'device'`, lié à `sub` et à l'email normalisé, valable 1 an, `HttpOnly; Secure; SameSite=Strict; Path=/`. Au login, si ce cookie est valide et correspond à l'email saisi (et à l'admin trouvé), le blocage par compte est ignoré et ses échecs ne sont pas comptés ; la limite par IP s'applique toujours. Ce cookie **n'authentifie jamais** une requête (seul le cookie de session le fait) : les deux jetons ne sont pas interchangeables (`typ` pour l'un, `sv`/`authTime` exigés pour l'autre), et le logout ne le supprime pas. Il est couvert par la redaction des logs (`cookie` et `set-cookie`).

### B5. CSRF : SameSite=Strict + contrôle d'`Origin`, sans jeton

**Décision.** Pas de `@fastify/csrf-protection`. Trois protections cumulées :
1. `SameSite=Strict` : le cookie n'est jamais envoyé sur une requête initiée par un autre site.
2. **Contrôle d'`Origin`** : un hook global `onRequest` refuse en `403 forbidden` toute requête de méthode non sûre (`POST`, `PUT`, `PATCH`, `DELETE`) dont l'en-tête `Origin` est absent ou n'appartient pas à `WEB_ORIGINS`. Les navigateurs envoient toujours `Origin` sur ces méthodes ; cela couvre aussi le login (« login CSRF ») et le cas d'un sous-domaine compromis du même site.
3. Corps en JSON uniquement, validés par `strictObject` : un formulaire HTML cross-site ne peut pas produire `application/json`.

Conséquence pour les tests et `curl` : envoyer `-H 'Origin: http://localhost:5173'`.

### B6. Origine et hébergement (contrainte pour la phase 3)

Le cookie `SameSite=Strict` impose que le front et l'API soient **du même site**. Décision à respecter au déploiement : l'API est servie **sur la même origine** que le front via une réécriture `/api/*` de l'hébergeur front (Netlify `_redirects` / Vercel `rewrites`) vers Render/Railway, comme le proxy Vite en dev. Ne jamais utiliser `*.vercel.app` + `*.onrender.com` (deux sites distincts : le cookie ne partirait pas). Repli : `tatamap.fr` + `api.tatamap.fr` (même site, mais il faudrait alors CORS avec credentials).

### B7. Durcissement Fastify

| Mesure | Réglage |
| --- | --- |
| `@fastify/helmet@~13.2.0` | défauts + `contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }` (l'API ne sert que du JSON), `crossOriginResourcePolicy: { policy: 'same-site' }`. La CSP du **front** se fera chez l'hébergeur en phase 3 (compatible Three.js : pas d'`unsafe-eval` nécessaire). |
| `bodyLimit` | `256 * 1024` dans `Fastify({ … })`. Une technique de 40 étapes pèse environ 50 Kio. Au-delà : `413 payload_too_large` (déjà géré par `errors.ts`). |
| `@fastify/rate-limit@~11.2.1` | `global: false`, appliqué au seul `POST /api/auth/login` : **5 tentatives / 15 min / IP**, réponse `429 rate_limited` au message générique. Store mémoire (un seul process). |
| `trustProxy` | `TRUST_PROXY` (nombre de proxys, 0 par défaut = désactivé ; 1 en prod derrière l'hébergeur) pour que l'IP du rate-limit soit la vraie. |
| Logs | Fastify ne logge pas les corps ; **le handler de login ne logge jamais `request.body`**, utilise `safeParse` (pas d'exception portant l'entrée). `logger.redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]']`. Un test capture les logs et vérifie qu'un mot de passe « canari » n'y figure pas. |
| Entrées | `strictObject` pour **tous** les bodies, params et query admin. Jamais de body brut vers Prisma : chaque route mappe explicitement les champs (`toTechniqueWriteData`, `toStepCreateData`…). |
| Public | Toute route publique filtre `status: 'published'` (techniques et cibles d'enchaînement). Règle de nommage : les fonctions du repository public s'appellent `findPublished*` ; chaque route publique a un test « brouillon → 404 / absent ». |
| Erreurs login | `401 unauthorized`, message unique `Invalid credentials` que l'email existe ou non (+ hash factice B3). |

### B8. Variables d'environnement

```ts
// apps/api/src/env.ts
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('127.0.0.1'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    JWT_SECRET: z
      .string()
      .refine((s) => Buffer.byteLength(s, 'utf8') >= 32, 'JWT_SECRET must be at least 32 bytes'),
    WEB_ORIGINS: z
      .string()
      .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean))
      .pipe(z.array(z.url().transform((u) => new URL(u).origin)).min(1)),
    COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.COOKIE_SECURE, {
    message: 'COOKIE_SECURE=false is forbidden in production',
    path: ['COOKIE_SECURE'],
  });
```

`.env.example` : `JWT_SECRET=` **vide** (l'API refuse de démarrer tant qu'il n'est pas rempli ; générer avec `openssl rand -base64 48`), `WEB_ORIGINS=http://localhost:5173`, `COOKIE_SECURE=true`, `TRUST_PROXY=0`. Attention : ouvrir le front sur `http://127.0.0.1:5173` au lieu de `localhost` donnera des 403 (origine différente).

`buildApp` ne lit plus jamais `process.env` : il reçoit `buildApp({ prisma, config })` où `config: AppConfig` est dérivé de `Env` (`jwtSecret`, `webOrigins`, `cookieSecure`, `cookieName`, `trustProxy`, `logLevel`). Les tests construisent leur `config` via `apps/api/src/test-utils.ts`.

### B9. Base de test séparée

Les tests d'intégration écrivent dans la base. À partir de la phase 2, la base locale contient le **contenu réel** de Fares : les tests passent sur une base distincte `tatamap_test`. `prisma.config.ts` lit `env(process.env.PRISMA_TARGET === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL')` ; `test-setup.ts` exige `TEST_DATABASE_URL` et l'utilise ; script racine `db:test:reset` (`PRISMA_TARGET=test prisma migrate reset --force`, qui migre et seede). En CI, `TEST_DATABASE_URL` = la même URL que `DATABASE_URL`.

---

## Partie C — API d'écriture

### C1. Changements de schéma Prisma (migration `phase2_admin`)

```prisma
model Technique {
  // ...
  /// Optimistic concurrency token, incremented by every admin write.
  version Int @default(1)
}
```

+ la contrainte `Chain_no_self_link` (A4), ajoutée à la main dans le `migration.sql` créé avec `prisma migrate dev --create-only --name phase2_admin`. Rien d'autre ne change.

### C2. Décisions

| Sujet | Décision | Justification courte |
| --- | --- | --- |
| Forme du PUT | **Remplacement complet** (métadonnées + étapes + tags + enchaînements) dans une transaction : `steps.deleteMany` + `createMany` via `toStepCreateData`, `tags: { set }`, `chainsFrom.deleteMany` + `createMany`. | L'éditeur possède l'état complet ; un diff ajouterait des ids d'étapes, des conflits d'ordre (`@@unique([techniqueId, order])`) et beaucoup de code pour un gain nul (≤ 50 Kio). Prévu par l'ADR 0002. |
| Concurrence | Colonne **`version Int`** : chaque écriture (PUT, publish, unpublish) envoie la version lue ; l'API fait `updateMany({ where: { id, version }, data: { …, version: { increment: 1 } } })`. 0 ligne → `409 version_mismatch`. | Atomique sans verrou, plus fiable que `updatedAt` (précision, sérialisation). Cas réel visé : deux onglets ouverts. |
| Slugs | Généré par `slugify(name)` (shared) à la création, modifiable dans l'éditeur. Unicité par la contrainte SQL : conflit → `409 slug_taken` (pas de suffixe automatique, sauf pour la duplication). **Slug figé une fois publié** : `409 slug_locked` si le PUT d'une technique publiée change le slug ; pour le changer, dépublier, modifier, republier. | Le slug est l'URL publique (SEO, liens partagés au club) ; pas de table de redirections avant d'en avoir besoin. |
| Brouillon / publié | **Édition directe** de la technique publiée (pas de copie brouillon). Un PUT sur une technique publiée doit garder la technique publiable (`409 not_publishable` sinon). Pour un gros remaniement : « Dupliquer », travailler sur la copie, puis dépublier l'ancienne. | Un seul admin, pas encore de public. Une copie brouillon doublerait le modèle (technique « fantôme », fusion). |
| Règles de publication | `publishIssues()` (shared) : au moins **2 étapes** et au moins **1 point clé**. L'invariant soumission/arrivée est vérifié à toute écriture, brouillon compris. | Minimum pour qu'une page soit utile ; l'éditeur affiche la liste des manques. |
| Suppression | `DELETE` uniquement d'un **brouillon** (`409 still_published` sinon). | Évite de casser une URL publique d'un clic. |
| Création | `POST` avec les seules métadonnées ; l'API crée une étape « Étape 1 » avec `STARTER_POSE` (shared : deux combattants debout face à face). Pour partir d'une position existante, **dupliquer** une technique qui part de la même position. | Pas d'éditeur vide ; la duplication couvre le cas courant (beaucoup de techniques partent de la garde fermée). |
| Duplication | `POST /api/admin/techniques/:id/duplicate` → brouillon, nom `« … (copie) »`, slug `<slug>-copie`, `-copie-2`… ; copie étapes, tags, points clés, erreurs ; pas les enchaînements. | Accélère fortement la saisie. |
| Tags | `POST /api/admin/tags` (création explicite) ; le PUT de la technique porte `tagIds`. Pas de modification/suppression de tag en phase 2 (Prisma Studio si besoin). | Minimal. |
| Positions | `GET/POST/PUT /api/admin/positions`, créées et modifiées **depuis l'éditeur** (dialogue). Pas de suppression en phase 2 (`onDelete: Restrict`). Slug de position modifiable (pas encore d'URL publique). | Le besoin naît pendant la saisie d'une technique. |
| Enchaînements | Portés par le PUT : `chains: [{ toId, type }]` (remplacement). Cible brouillon autorisée (le public filtre déjà sur `published`). | Une seule écriture, un seul bouton « Enregistrer ». |
| Références | Positions, tags et cibles inexistants → `400 unknown_reference` ; vérifiés dans la transaction avant écriture. | Message exploitable au lieu d'une erreur Prisma de clé étrangère (500). |

### C3. Schémas Zod d'écriture

Nouveaux fichiers dans `packages/shared/src/admin/` (réexportés par `index.ts`).

```ts
// packages/shared/src/slug.ts
/** "Clé de bras (armbar) — Œil" -> "cle-de-bras-armbar-oeil". May return '' or 1 char: callers validate with slugSchema. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
}
```

```ts
// packages/shared/src/admin/common.ts
import { z } from 'zod';

export const idSchema = z.uuid();
export const idParamsSchema = z.strictObject({ id: idSchema });
export const versionInputSchema = z.strictObject({ version: z.int().min(1) });

/** Trimmed variants for inputs typed by a human. */
export const labelInputSchema = z.string().trim().min(1).max(120);
export const listItemInputSchema = z.string().trim().min(1).max(300);

export const hasNoDuplicates = <T>(items: ReadonlyArray<T>, key: (item: T) => string): boolean =>
  new Set(items.map(key)).size === items.length;
```

```ts
// packages/shared/src/admin/technique.ts
import { z } from 'zod';
import { slugSchema } from '../common';
import { categorySchema, chainTypeSchema, giModeSchema, levelSchema, techniqueStatusSchema, type Category } from '../enums';
import { currentPoseSchema } from '../pose/pose';
import { END_POSITION_MESSAGE, hasConsistentEndPosition, labelSchema, stepTextSchema, transitionMsSchema } from '../technique';
import { hasNoDuplicates, idSchema, labelInputSchema, listItemInputSchema } from './common';

/** A step on write: no `order`, the array index is the order (see toStepCreateData). */
export const stepInputSchema = z.strictObject({
  title: labelInputSchema,
  text: stepTextSchema.trim(),
  transitionMs: transitionMsSchema,
  pose: currentPoseSchema,
});
export type StepInput = z.infer<typeof stepInputSchema>;

export const chainInputSchema = z.strictObject({ toId: idSchema, type: chainTypeSchema });
export type ChainInput = z.infer<typeof chainInputSchema>;

const techniqueMetaShape = {
  slug: slugSchema,
  name: labelInputSchema,
  category: categorySchema,
  level: levelSchema,
  gi: giModeSchema,
  startPositionId: idSchema,
  endPositionId: idSchema.nullable(),
};

const techniqueContentShape = {
  ...techniqueMetaShape,
  keyPoints: z.array(listItemInputSchema).max(20),
  commonMistakes: z.array(listItemInputSchema).max(20),
  tagIds: z.array(idSchema).max(20),
  steps: z.array(stepInputSchema).min(1).max(40),
  chains: z.array(chainInputSchema).max(30),
};

const endPositionRule = (t: { category: Category; endPositionId: string | null }) =>
  hasConsistentEndPosition(t.category, t.endPositionId !== null);
const endPositionIssue = { message: END_POSITION_MESSAGE, path: ['endPositionId'] };

/** POST /api/admin/techniques. Slug defaults to slugify(name) on the server. */
export const techniqueCreateInputSchema = z
  .strictObject({ ...techniqueMetaShape, slug: slugSchema.optional() })
  .refine(endPositionRule, endPositionIssue);
export type TechniqueCreateInput = z.infer<typeof techniqueCreateInputSchema>;

/** Base of PUT input and admin detail; no refinement so it stays derivable. */
export const techniqueContentBaseSchema = z.strictObject(techniqueContentShape);

const withContentRules = <S extends z.ZodType<z.infer<typeof techniqueContentBaseSchema>>>(schema: S) =>
  schema
    .refine(endPositionRule, endPositionIssue)
    .refine((t) => hasNoDuplicates(t.tagIds, (id) => id), { message: 'duplicate tag', path: ['tagIds'] })
    .refine((t) => hasNoDuplicates(t.chains, (c) => `${c.toId}:${c.type}`), {
      message: 'duplicate chain',
      path: ['chains'],
    });

/** PUT /api/admin/techniques/:id — full replacement, guarded by `version`. */
export const techniqueUpdateInputSchema = withContentRules(
  techniqueContentBaseSchema.extend({ version: z.int().min(1) }),
);
export type TechniqueUpdateInput = z.infer<typeof techniqueUpdateInputSchema>;

/** Admin read model: everything the editor needs, ids included. Steps are ordered, without `order`. */
export const adminTechniqueSchema = withContentRules(
  techniqueContentBaseSchema.extend({
    id: idSchema,
    version: z.int().min(1),
    status: techniqueStatusSchema,
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  }),
);
export type AdminTechnique = z.infer<typeof adminTechniqueSchema>;

export const adminTechniqueListItemSchema = z.strictObject({
  id: idSchema,
  slug: slugSchema,
  name: labelSchema,
  category: categorySchema,
  status: techniqueStatusSchema,
  stepCount: z.int().min(0),
  startPositionName: labelSchema,
  updatedAt: z.iso.datetime(),
});
export const adminTechniqueListSchema = z.array(adminTechniqueListItemSchema);
export type AdminTechniqueListItem = z.infer<typeof adminTechniqueListItemSchema>;
```

*Ajout en P2-T27 :* `adminTechniqueListItemSchema` porte aussi `level` et `gi`, pour que l'aperçu puisse résoudre les cibles d'enchaînement en résumés publics sans requête supplémentaire.

(Si le générique de `withContentRules` pose problème de typage avec Zod 4, l'écrire sous forme de deux appels explicites : l'important est que les trois prédicats viennent des mêmes fonctions.)

```ts
// packages/shared/src/admin/publish.ts
/** Why a technique cannot be published yet (French, shown as-is in the editor). Empty = publishable. */
export function publishIssues(t: Pick<TechniqueUpdateInput, 'steps' | 'keyPoints'>): string[] {
  const issues: string[] = [];
  if (t.steps.length < 2) issues.push('Il faut au moins 2 étapes.');
  if (t.keyPoints.length < 1) issues.push('Ajoute au moins un point clé.');
  return issues;
}
```

```ts
// packages/shared/src/admin/position.ts and tag.ts
export const positionInputSchema = z.strictObject({
  slug: slugSchema,
  name: labelInputSchema,
  description: z.string().trim().max(1000),
  role: positionRoleSchema,
});
export const adminPositionSchema = positionInputSchema.extend({ id: idSchema });
export const adminPositionListSchema = z.array(adminPositionSchema);

export const tagInputSchema = z.strictObject({ slug: slugSchema, name: labelInputSchema });
export const adminTagSchema = tagInputSchema.extend({ id: idSchema });
export const adminTagListSchema = z.array(adminTagSchema);
```

```ts
// packages/shared/src/admin/auth.ts
export const loginInputSchema = z.strictObject({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(256), // max bounds argon2 work per request
});
export const adminSessionSchema = z.strictObject({ email: z.email() });
export const ADMIN_PASSWORD_MIN_LENGTH = 12; // enforced by the create-admin script only
```

```ts
// packages/shared/src/common.ts — error reasons (optional, backward compatible)
export const API_ERROR_REASONS = [
  'version_mismatch', // 409: someone saved in between (other tab)
  'slug_taken',       // 409
  'slug_locked',      // 409: slug change on a published technique
  'still_published',  // 409: delete of a published technique
  'not_publishable',  // 409: publish, or PUT of a published technique, with publishIssues()
  'unknown_reference',// 400: position / tag / chain target does not exist
  'self_chain',       // 400
] as const;
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    reason: z.enum(API_ERROR_REASONS).optional(),
  }),
});
export type ApiErrorReason = (typeof API_ERROR_REASONS)[number];
```

`sendApiError(reply, status, code, message, reason?)` gagne le paramètre optionnel.

Utilitaires de pose (shared, purs, testés) :

```ts
// packages/shared/src/pose/edit.ts
/** World mirror across the plane z = 0, swapping L/R joints (the technique done on the other side). Involution. */
export function mirrorPose(pose: CurrentPose): CurrentPose;
/** Clamps every joint into POSE_BOUNDS_CM so an edited pose always passes currentPoseSchema. */
export function clampVec3(v: Vec3): Vec3;
export type BoneKey = `${JointV1_11}-${JointV1_11}`; // from BONES_V1_11
export function boneLengths(fighter: FighterPoseV1_11): Record<BoneKey, number>;
export const BONE_LENGTH_TOLERANCE = 0.15;
export type PoseWarning = { fighter: FighterId; bone: BoneKey; lengthCm: number; referenceCm: number };
/** Bones whose length differs by more than 15 % from the same bone in `reference` (step 1). Warnings, never errors (ADR 0002). */
export function poseWarnings(pose: CurrentPose, reference: CurrentPose): PoseWarning[];
/** Two fighters standing face to face; used for a new technique's first step. Valid for currentPoseSchema. */
export const STARTER_POSE: CurrentPose;
```

`STARTER_POSE` : `me` debout face à +x (sa gauche est vers −z), centré en x = −50 :
`head [-50,160,0]`, `neck [-50,140,0]`, `hip [-50,95,0]`, `elbowL [-40,110,-20]`, `handL [-15,128,-15]`, `elbowR [-40,110,20]`, `handR [-15,128,15]`, `kneeL [-45,50,-12]`, `footL [-50,5,-15]`, `kneeR [-45,50,12]`, `footR [-50,5,15]` ; `opponent` = `me` tourné de 180° autour de y (`[x, y, z] → [−x, y, −z]`), ce qui garde L/R corrects ; `camera` = `DEFAULT_CAMERA`.

### C4. Contrat des routes

Toutes les erreurs ont la forme `apiErrorSchema`. « Origin » = `403 forbidden` si l'en-tête `Origin` manque ou n'est pas dans `WEB_ORIGINS` (méthodes non sûres, B5). « 401 » = cookie absent, invalide, expiré ou admin supprimé. Les ids sont des UUID (`idParamsSchema`) : un id mal formé donne `400 bad_request` (avant toute requête SQL), un id inconnu `404 not_found`.

**Authentification** (hors hook admin) :

| Route | Corps | Succès | Erreurs |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `loginInputSchema` | `200` `adminSessionSchema` + `Set-Cookie` | `400`, `401` (message unique), `403` Origin, `429 rate_limited` |
| `POST /api/auth/logout` | aucun | `204` + cookie effacé (`Max-Age=0`) | `403` Origin |

**Admin** — plugin préfixé `/api/admin`, toutes avec `401` possible et `Cache-Control: private, no-store` (y compris sur les erreurs) :

| Route | Corps | Succès | Erreurs spécifiques |
| --- | --- | --- | --- |
| `GET /me` | — | `200` `adminSessionSchema` | — |
| `GET /techniques` | — | `200` `adminTechniqueListSchema`, tri `updatedAt` desc | — |
| `POST /techniques` | `techniqueCreateInputSchema` | `201` `adminTechniqueSchema` (statut `draft`, version 1, 1 étape `STARTER_POSE`) | `400` (schéma, slug généré invalide), `400 unknown_reference`, `409 slug_taken` |
| `GET /techniques/:id` | — | `200` `adminTechniqueSchema` (tout statut ; poses passées par `upgradePose`) | `404` |
| `PUT /techniques/:id` | `techniqueUpdateInputSchema` | `200` `adminTechniqueSchema` (version + 1) | `400`, `400 unknown_reference`, `400 self_chain`, `404`, `409 version_mismatch`, `409 slug_taken`, `409 slug_locked`, `409 not_publishable` |
| `POST /techniques/:id/publish` | `versionInputSchema` | `200` `adminTechniqueSchema` (`published`, `publishedAt` posé s'il était nul, version + 1). Idempotent sur une technique déjà publiée. | `404`, `409 version_mismatch`, `409 not_publishable` |
| `POST /techniques/:id/unpublish` | `versionInputSchema` | `200` `adminTechniqueSchema` (`draft`, `publishedAt` conservé, version + 1) | `404`, `409 version_mismatch` |
| `POST /techniques/:id/duplicate` | aucun | `201` `adminTechniqueSchema` (nouveau brouillon) | `404` |
| `DELETE /techniques/:id` | — | `204` | `404`, `409 still_published` |
| `GET /positions` | — | `200` `adminPositionListSchema`, tri par nom (`fr`) | — |
| `POST /positions` | `positionInputSchema` | `201` `adminPositionSchema` | `409 slug_taken` |
| `PUT /positions/:id` | `positionInputSchema` | `200` `adminPositionSchema` | `404`, `409 slug_taken` |
| `GET /tags` | — | `200` `adminTagListSchema`, tri par nom | — |
| `POST /tags` | `tagInputSchema` | `201` `adminTagSchema` | `409 slug_taken` |

Ordre des vérifications du PUT, dans **une transaction interactive** :
1. `findUnique(id)` → `404` ; `version` différente → `409 version_mismatch`.
2. Technique publiée : slug changé → `409 slug_locked` ; `publishIssues(input)` non vide → `409 not_publishable`.
3. `chains.some(c => c.toId === id)` → `400 self_chain`.
4. Existence de `startPositionId`, `endPositionId`, `tagIds`, `chains[].toId` (un `count` par table) → `400 unknown_reference`.
5. `technique.updateMany({ where: { id, version }, data: { …toTechniqueWriteData(input), version: { increment: 1 } } })` ; `count === 0` → `409 version_mismatch` (course entre 1 et 5).
6. `tags: { set }` (via `update`), `step.deleteMany` + `createMany(toStepCreateData(id, input.steps))`, `chain.deleteMany({ where: { fromId: id } })` + `createMany`.
7. Erreur Prisma `P2002` sur `slug` → `409 slug_taken`. Relecture et réponse.

`toTechniqueWriteData(input)` ne copie que les champs listés (`slug`, `name`, `category`, `level`, `gi`, `keyPoints`, `commonMistakes`, `startPositionId`, `endPositionId`) : jamais de spread du body.

### C5. Export et import du contenu

Le contenu saisi en phase 2 vit dans la base **locale** ; il doit survivre à un `db:reset` et rejoindre la prod en phase 3. Décision : `pnpm content:export` écrit `content/positions.json`, `content/tags.json` et `content/techniques/<slug>.json` (format `contentTechniqueSchema` de shared : comme `adminTechniqueSchema` mais **par slugs** — `startPosition`, `endPosition`, `tags`, `chains[].to` — sans id ni version), triés et formatés de façon stable pour des diffs git lisibles. `pnpm content:import` fait l'inverse (upsert par slug dans une transaction, étapes via `toStepCreateData`, statut conservé). C'est la sauvegarde et le chemin vers la prod.

**Stockage (décision de Fares)** : le repo de code reste **public** (portfolio), le contenu n'y est jamais commité. `content/` est un clone du repo **privé** `Fares30-coder/tatamap-content`, ignoré par le `.gitignore` du repo public. Les scripts lisent et écrivent dans `CONTENT_DIR` (défaut : `content/` à la racine du monorepo). Après un export, on commite et pousse depuis `content/` (`git -C content add -A && git -C content commit && git -C content push`). Les tests n'utilisent jamais `content/` : ils travaillent dans un dossier temporaire.

---

## Partie D — Viewer étendu et éditeur

### D1. Contrat du viewer

Un seul rendu 3D, découpé en deux couches :

```ts
// apps/web/src/features/viewer/TechniqueScene.tsx
export type ViewerStep = { pose: CurrentPose; transitionMs: number };
export type JointRef = { fighter: FighterId; joint: JointV1_11 };
/** 'step': perspective, camera hint of the current step (or DEFAULT_CAMERA).
 *  'front' | 'side' | 'top': orthographic axis views (looking along -z, -x, -y) centred on the step's target. */
export type ViewPreset = 'step' | 'front' | 'side' | 'top';

export type TechniqueSceneProps = {
  steps: ReadonlyArray<ViewerStep>;
  /** Controlled: step to show / play from. */
  stepIndex: number;
  playing: boolean;
  speed?: number; // default 1
  loop?: boolean; // default true
  holdMs?: number; // default DEFAULT_HOLD_MS
  /** OrbitControls on/off (default true; false for thumbnails). */
  interactive?: boolean;
  onStepChange?: (index: number) => void;

  /** Framing, applied on mount and every time `cameraKey` changes (never forced during playback otherwise). */
  view?: ViewPreset; // default 'step'
  cameraKey?: number; // bump to re-apply the current step's camera (e.g. "Recentrer")

  /** Editor: joint picking and highlight. Spheres are pickable only when this is set. */
  onJointPointerDown?: (joint: JointRef, event: ThreeEvent<PointerEvent>) => void;
  selectedJoint?: JointRef | null;
  /** Editor: translucent "onion skin" pose (e.g. previous step). Not pickable. */
  ghostPose?: CurrentPose | null;

  /** Extra 3D content rendered inside the scene (TransformControls, camera capture...). */
  children?: ReactNode;
};

/** Everything inside the canvas. Owns its camera (drei PerspectiveCamera / OrthographicCamera with
 *  makeDefault) and its controls, so it works the same in a <Canvas> or in a drei <View>. */
export function TechniqueScene(props: TechniqueSceneProps): JSX.Element;
```

```ts
// apps/web/src/features/viewer/TechniqueViewer.tsx
export type TechniqueViewerProps = TechniqueSceneProps & { className?: string };

/** The single reusable viewer = <Canvas> + <TechniqueScene>. Children go inside the canvas. */
export function TechniqueViewer({ className, ...scene }: TechniqueViewerProps): JSX.Element;
// <Canvas frameloop={scene.playing ? 'always' : 'demand'} dpr={[1, 2]}>
//   <color attach="background" args={['#f1f5f9']} />
//   <TechniqueScene {...scene} />
// </Canvas>
```

Règles :
- **Caméra possédée par la scène** (`<PerspectiveCamera makeDefault fov={40} near={1} far={5000} />` ou `<OrthographicCamera makeDefault …>` selon `view`), plus aucune prop `camera` sur le `<Canvas>`. Le cadrage (position, cible, `up`, zoom ortho) est calculé par une fonction pure `frameCamera(view, stepCamera, viewportWidthPx)` dans `viewer/camera.ts`, testée en Node. En vue orthographique, la rotation d'OrbitControls est désactivée (zoom et panoramique restent).
- **`frameloop="demand"` à l'arrêt** : la scène appelle `invalidate()` après chaque `setPose` impératif ; OrbitControls et TransformControls de drei invalident d'eux-mêmes. En pause, le GPU ne travaille plus.
- **Changement de `steps` à l'arrêt** (édition) : si `playing` est faux, la pose de `steps[stepIndex]` est réappliquée à chaque nouvelle référence de `steps`, même si `stepIndex` n'a pas changé (le mécanisme `isStepEcho` actuel ne doit pas l'empêcher). La fonction de décision reste pure et testée (`shouldReapplyPose`).
- **Sélection** : `FighterMesh` reçoit `onJointPointerDown` (avec `event.stopPropagation()`) et `selectedJoint` (sphère en surbrillance : `emissive` + rayon × 1,4). Le fantôme est un troisième et quatrième `FighterMesh` en `variant="ghost"` (opacité 0,25, `depthWrite={false}`, pas d'événements).
- Pas de `onPointerMissed` pour désélectionner : un clic sur la poignée de TransformControls déclencherait une désélection. Désélection par `Échap` ou bouton.

### D2. Éditeur : décisions UX

| Sujet | Décision |
| --- | --- |
| Déplacement d'une articulation | **`TransformControls` de drei en mode `translate`** sur l'articulation sélectionnée (enfant du viewer, `translationSnap={1}` cm), plus un **panneau numérique x / y / z** (pas de 1 cm, Maj = 10 cm). Le panneau sert aussi à sélectionner une articulation par son nom (22 boutons) quand des sphères se recouvrent. Pendant le glisser, chaque `objectChange` met à jour l'état (React, sans historique) ; `mouseDown` ouvre une entrée d'annulation, `mouseUp` la referme. Coordonnées toujours bornées par `clampVec3` : la pose reste valide. OrbitControls est `makeDefault`, donc désactivé automatiquement pendant le glisser. |
| Vues | 4 boutons : **3D** (`step`, perspective libre), **Face**, **Profil**, **Dessus** (orthographiques). Les vues ortho sont celles où l'on place précisément ; la 3D sert à vérifier. |
| Démarrer une étape | « Ajouter une étape » insère après l'étape courante une **copie de sa pose** (titre « Étape n », `DEFAULT_TRANSITION_MS`). Bouton « Copier la pose de l'étape précédente » sur l'étape courante. Étapes réordonnables (↑ ↓) et supprimables (pas la dernière restante). |
| Fantôme | Case « Afficher l'étape précédente » (activée par défaut) : `ghostPose` = pose de l'étape i − 1. |
| Symétrie | « Miroir gauche/droite » : `mirrorPose` sur l'étape courante ou sur toutes les étapes (technique côté opposé). Pas de symétrie membre par membre en phase 2. |
| Longueurs d'os | `poseWarnings(pose, steps[0].pose)` affiché sous le panneau : « Avant-bras gauche de toi : 42 cm (réf. 31 cm) ». Avertissement seulement, jamais bloquant (ADR 0002). |
| Caméra de l'étape | « Utiliser cet angle pour l'étape » : un enfant `CameraCapture` (`useThree`) lit la caméra et la cible courantes et les écrit dans `pose.camera` (bornées par `cameraSchema`). « Retirer l'angle » remet `undefined`. |
| Annuler / rétablir | Historique de 100 instantanés dans un réducteur pur (`editor-state.ts`) ; `Ctrl/Cmd+Z`, `Ctrl/Cmd+Maj+Z`. |
| Lecture | Bouton Lecture/Pause dans l'éditeur : joue les étapes **non enregistrées** depuis l'étape courante (même viewer). |
| Sauvegarde | **Manuelle** : bouton « Enregistrer » + `Ctrl/Cmd+S`, indicateur « Modifications non enregistrées ». **Garde-fou de sortie** : `beforeunload` + `useBlocker` de React Router quand l'état est sale. **Pas d'autosave** : sur une technique publiée (édition directe), un autosave publierait des poses à moitié faites. Si une perte arrive en pratique, on ajoutera une sauvegarde locale de secours. |
| Session expirée | Un `401` à l'enregistrement ne vide pas l'éditeur : message « Session expirée : reconnecte-toi dans un autre onglet puis réessaie ». |
| Conflit | `409 version_mismatch` : message « Modifiée ailleurs (autre onglet). » + bouton « Recharger » (perd les modifs locales) et « Copier mes modifications (JSON) » dans le presse-papiers. |
| Aperçu | Bouton « Aperçu » : dialogue plein écran qui rend la **mise en page de la page publique** (`TechniqueView`, extrait de `TechniquePage`) à partir de l'état courant, non enregistré compris. Pas de route publique de brouillon ni de jeton de prévisualisation. |
| Publication | « Publier » désactivé si l'état est sale ou si `publishIssues` n'est pas vide (liste affichée) ; « Dépublier » sur une technique publiée ; « Supprimer » sur un brouillon (confirmation). |
| Positions | Les selects Départ / Arrivée ont « + Nouvelle position » et « Modifier » (dialogue : nom, slug auto via `slugify`, rôle, description). Arrivée forcée à vide et désactivée quand la catégorie est « Soumission ». |
| Tags | Liste à cocher + « + Nouveau tag ». |
| Enchaînements | Liste (type + technique cible, cible ≠ technique courante, brouillons inclus et marqués « brouillon »). |
| Chargement | Routes `/admin/*` en **lazy** (`lazy` de React Router) : TransformControls et l'éditeur ne pèsent pas sur le bundle public. |

### D3. Routes web

- `/admin/login` : email + mot de passe ; messages FR selon `code` (`401` → « Identifiants invalides », `429` → « Trop de tentatives, réessaie dans quelques minutes. »). Redirige vers `?next=` (chemin interne `/admin…` uniquement, sinon `/admin/techniques`).
- `/admin` → redirige vers `/admin/techniques`.
- `/admin/techniques` : tableau (nom, catégorie, position de départ, statut, nombre d'étapes, modifié le), boutons « Nouvelle technique » (dialogue : nom, slug, catégorie, niveau, gi, départ, arrivée), « Dupliquer », « Supprimer » (brouillons), lien « Voir » vers la page publique pour les techniques publiées.
- `/admin/techniques/:id` : l'éditeur.
- Garde `RequireAdmin` (`GET /api/admin/me`) ; `401` → `/admin/login?next=…`. Bouton « Se déconnecter ».

### D4. Vignettes (décidé maintenant, implémenté en phase 3)

**Décision.** Un **seul `<Canvas>` partagé** (fixe, plein écran, `eventSource` = racine de l'app, `frameloop="demand"`) et un **`<View>` de drei par carte**, chacun contenant `<TechniqueScene interactive={false} playing={hovered} …/>`. Une seule carte joue à la fois (survol, ou visible au centre sur mobile) ; les autres affichent l'étape 1 figée et ne coûtent rien tant qu'on n'invalide pas. Un seul contexte WebGL quel que soit le nombre de cartes (les navigateurs en limitent le nombre à ~16).

Ce que cela impose **dès la phase 2** (et que D1 respecte) : `TechniqueScene` ne dépend d'aucune prop du `<Canvas>` (caméra, fond), possède sa propre caméra `makeDefault`, et ne touche pas à `gl` globalement. Repli si `View` déçoit : image statique générée par le viewer (`toDataURL`) et 3D au survol uniquement.

**Mise à jour (phase 3, lot 3).** Le repli est appliqué. Sur téléphone, le `<Canvas>` fixe et ses `<View>` sont redessinés après le défilement natif de la page : les vignettes glissaient par rapport à leurs cartes. Chaque carte affiche maintenant une image fixe de l'étape 1, rendue une fois par session par un `<Canvas>` hors écran (une image à la fois, puis il se démonte), et seule la carte qui joue (survol, ou centre de l'écran sur téléphone) monte son propre petit `<Canvas>`. Toujours au plus un ou deux contextes WebGL à la fois.

---

## Conséquences

- L'API gagne 5 dépendances, toutes de l'écosystème Fastify officiel sauf `@node-rs/argon2` ; le web n'en gagne **aucune** (TransformControls, OrthographicCamera et View sont dans drei).
- Le contrat admin est entièrement dans `@tatamap/shared` : l'éditeur valide localement avec `techniqueUpdateInputSchema` avant d'envoyer, l'API revalide.
- `buildApp` exige une configuration d'auth : impossible de démarrer l'API (ou un test) sans secret JWT.
- Les tests d'intégration tournent sur `tatamap_test` : le contenu de Fares n'est jamais touché par `pnpm test`.
- Le contenu est sauvegardé dans le repo privé `tatamap-content`, cloné dans `content/` (ignoré par le repo public) : ni brouillons ni contenu dans le repo de code.
- Contraintes posées pour la phase 3 : même origine front/API (B6), service worker qui exclut `/api/admin/*` et `/api/auth/*`, vignettes via `View` (D4), CSP du front chez l'hébergeur.

### Proposition de modification de `CLAUDE.md`

1. Tableau « Stack », remplacer la ligne Auth :

```md
| Auth | Un seul compte admin créé par `pnpm admin:create` (argon2id) ; JWT HS256 de 2 h (renouvelé à l'usage) en cookie `HttpOnly; Secure; SameSite=Strict` ; contrôle d'`Origin` sur les requêtes d'écriture (ADR 0003) |
```

2. Section « API REST (MVP) », remplacer le bloc « Admin (JWT) » par :

```md
Auth : `POST /api/auth/login`, `POST /api/auth/logout`

Admin (cookie de session, toutes sous `/api/admin`, un seul hook d'auth, réponses `no-store`) :
- `GET /api/admin/me`
- `GET|POST /api/admin/techniques`, `GET|PUT|DELETE /api/admin/techniques/:id` (PUT = remplacement complet infos + étapes + poses + tags + enchaînements, avec `version`)
- `POST /api/admin/techniques/:id/publish`, `/unpublish`, `/duplicate`
- `GET|POST /api/admin/positions`, `PUT /api/admin/positions/:id`
- `GET|POST /api/admin/tags`
```

et retirer la ligne `POST /api/auth/login (JWT admin)` de la partie « Public ».

3. Section « Modèle de données », ligne Technique : ajouter « version (concurrence optimiste) » après « statut (brouillon/publié) ».

4. Section « Écrans », remplacer la ligne admin par :

```md
- `/admin/login`, `/admin/techniques` (liste, création, duplication), `/admin/techniques/:id` Éditeur de poses (articulations déplaçables, vues face/profil/dessus, aperçu, publier)
```

5. Section « Conventions », ajouter :

```md
- Le contenu (positions, tags, techniques) est exporté dans `content/` par `pnpm content:export` et réimporté par `pnpm content:import` (sauvegarde et passage en prod). `content/` est un clone du repo **privé** `Fares30-coder/tatamap-content`, ignoré par ce repo public : ne jamais commiter de contenu ici.
```

## Versions (registre npm, 2026-10-28)

| Paquet | Version retenue | Compatibilité |
| --- | --- | --- |
| `@fastify/helmet` | ~13.2.0 | Fastify 5 (fastify-plugin 6), publiée le 13/10 |
| `@fastify/rate-limit` | ~11.2.1 | Fastify 5 |
| `@fastify/cookie` | ~11.1.3 | Fastify 5. 11.1.4 et 11.1.5 datent du 27/10 : si `minimumReleaseAge` de pnpm les bloque, la plage résout 11.1.3 ; ne pas ajouter d'exclusion. |
| `@fastify/jwt` | ~10.2.5 | Fastify 5, s'appuie sur `fast-jwt` 6 ; option `cookie` (nécessite `@fastify/cookie`) |
| `@node-rs/argon2` | ~2.2.2 | binaires napi précompilés (darwin-arm64, linux-x64…), aucun script d'installation |
| `@react-three/drei` | ~10.7.9 (inchangé) | `TransformControls`, `OrthographicCamera`, `PerspectiveCamera`, `View` disponibles |

Écartés : `argon2` 0.45 (compilation native et script d'installation à autoriser dans pnpm), `jose` (fonctionne, mais `@fastify/jwt` apporte déjà l'intégration cookie et la restriction d'algorithme), `@fastify/csrf-protection` (inutile avec B5), `@fastify/cors` (même origine).
