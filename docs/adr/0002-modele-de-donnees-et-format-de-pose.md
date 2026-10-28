# ADR 0002 — Modèle de données et format de pose

- Statut : accepté
- Date : 2026-10-28
- Auteur : agent architecte (pour Fares Haouari)
- Dépend de : ADR 0001 (Prisma 7.10.1, Zod 4, `@tatamap/shared` consommé en source)

## Contexte

`CLAUDE.md` décrit le modèle (une technique est une arête entre deux positions), le format de pose `v1-11` et la route `GET /api/techniques/:slug`. Il faut maintenant fixer :

1. le schéma Prisma exact ;
2. les schémas Zod de `packages/shared`, qui servent de contrat entre l'API et le front ;
3. la stratégie de versionnement du squelette, pour pouvoir passer un jour à un squelette plus détaillé sans casser les données.

Le code ci-dessous est **proposé** : l'agent `dev` le recopie et l'adapte dans les fichiers source indiqués.

## Décisions

### D1. Identifiants, slugs et nommage

- Les clés primaires sont des **UUID v7** (`@default(uuid(7)) @db.Uuid`) : triables dans le temps et non devinables. Elles ne sont **pas exposées par l'API publique**, qui ne parle qu'en slugs. L'admin utilisera les ids.
- Les slugs sont **en français** (contenu du site, SEO) : `ciseau-garde-fermee`, `garde-fermee`, `montee`. Format : `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longueur de 2 à 100.
- Les valeurs d'enum sont en anglais, en minuscules, identiques en base, dans Zod et dans le JSON de l'API. Les libellés français vivent dans `shared` (`*_LABELS_FR`).

| Notion (CLAUDE.md) | Enum | Valeurs |
| --- | --- | --- |
| catégorie | `Category` | `submission` (soumission), `pass` (passage), `sweep` (renversement), `escape` (sortie), `takedown` (projection) |
| niveau | `Level` | `beginner`, `intermediate`, `advanced` |
| gi / no-gi | `GiMode` | `gi`, `nogi`, `both` |
| rôle d'une position | `PositionRole` | `top`, `bottom`, `neutral` |
| statut | `TechniqueStatus` | `draft`, `published` |
| type d'enchaînement | `ChainType` | `followup` (suite), `counter` (contre), `alternative` |

`GiMode.both` : la plupart des techniques marchent avec ou sans kimono, et un booléen obligerait à dupliquer la technique. Le filtre `?gi=gi` renvoie donc `gi` et `both`, et `?gi=nogi` renvoie `nogi` et `both`.

`PositionRole` est exprimé **du point de vue de `me`**, c'est-à-dire du pratiquant qui exécute la technique : la garde fermée est `bottom` (on fait le ciseau depuis le dessous), la montée est `top`.

### D2. La pose est stockée dans l'étape, pas dans une table `Pose` séparée (écart avec CLAUDE.md)

`CLAUDE.md` liste une entité **Pose** (id, données JSONB, version du squelette) liée 1–1 à **Étape**. Je recommande de la **fusionner dans `Step`** : deux colonnes, `pose Json` et `skeleton String`.

Pourquoi :
- La relation est strictement 1–1, sans partage prévu. Une table à part n'apporte qu'une jointure, une relation optionnelle côté Prisma (le type `step.pose` devient `Pose | null`, il faut le tester partout) et des orphelins possibles à la suppression.
- Même le cas « réutiliser la pose de départ de la garde fermée dans dix techniques » est une **copie** (l'éditeur pré-remplit), pas une référence : modifier une technique ne doit pas en modifier dix autres.
- Si on veut un jour une bibliothèque de poses, on ajoutera une table `PoseTemplate` dans laquelle on copiera. Rien ne l'empêche.

Le concept de « Pose » reste un **document JSON typé** (schéma Zod `poseSchema`), seul son stockage change. La modification de `CLAUDE.md` est proposée en fin de document.

### D3. Schéma Prisma

Fichier : `apps/api/prisma/schema.prisma`. Prisma 7 : l'URL de la base n'est plus dans le schéma mais dans `apps/api/prisma.config.ts`.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Category {
  submission
  pass
  sweep
  escape
  takedown
}

enum Level {
  beginner
  intermediate
  advanced
}

enum GiMode {
  gi
  nogi
  both
}

enum PositionRole {
  top
  bottom
  neutral
}

enum TechniqueStatus {
  draft
  published
}

enum ChainType {
  followup
  counter
  alternative
}

/// A node of the position map (e.g. "Garde fermée"). Role is from `me`'s point of view.
model Position {
  id          String       @id @default(uuid(7)) @db.Uuid
  slug        String       @unique
  name        String
  description String       @default("")
  role        PositionRole
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  techniquesFrom Technique[] @relation("TechniqueStart")
  techniquesTo   Technique[] @relation("TechniqueEnd")
}

/// An edge of the position map: startPosition -> endPosition (null for a submission).
model Technique {
  id             String          @id @default(uuid(7)) @db.Uuid
  slug           String          @unique
  name           String
  category       Category
  level          Level
  gi             GiMode
  status         TechniqueStatus @default(draft)
  keyPoints      String[]
  commonMistakes String[]

  startPositionId String    @db.Uuid
  startPosition   Position  @relation("TechniqueStart", fields: [startPositionId], references: [id], onDelete: Restrict)
  endPositionId   String?   @db.Uuid
  endPosition     Position? @relation("TechniqueEnd", fields: [endPositionId], references: [id], onDelete: Restrict)

  steps      Step[]
  tags       Tag[]
  chainsFrom Chain[] @relation("ChainFrom")
  chainsTo   Chain[] @relation("ChainTo")

  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status, category])
  @@index([startPositionId])
  @@index([endPositionId])
}

/// One keyframe of a technique. `pose` is a Pose document validated by @tatamap/shared;
/// `skeleton` mirrors pose.skeleton so outdated poses can be found without parsing JSON.
model Step {
  id           String    @id @default(uuid(7)) @db.Uuid
  techniqueId  String    @db.Uuid
  technique    Technique @relation(fields: [techniqueId], references: [id], onDelete: Cascade)
  order        Int
  title        String
  text         String    @default("")
  transitionMs Int       @default(1300)
  skeleton     String
  pose         Json

  @@unique([techniqueId, order])
}

/// Technique-to-technique link (follow-up, counter, alternative).
model Chain {
  id     String    @id @default(uuid(7)) @db.Uuid
  fromId String    @db.Uuid
  from   Technique @relation("ChainFrom", fields: [fromId], references: [id], onDelete: Cascade)
  toId   String    @db.Uuid
  to     Technique @relation("ChainTo", fields: [toId], references: [id], onDelete: Cascade)
  type   ChainType

  @@unique([fromId, toId, type])
  @@index([toId])
}

model Tag {
  id         String      @id @default(uuid(7)) @db.Uuid
  slug       String      @unique
  name       String
  techniques Technique[]
}

model Admin {
  id           String   @id @default(uuid(7)) @db.Uuid
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}
```

`apps/api/prisma.config.ts` :

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url: env('DATABASE_URL') },
});
```

Client (Prisma 7, adaptateur obligatoire), `apps/api/src/db.ts` :

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
```

(Vérifier le chemin d'import exact produit par le générateur `prisma-client` en 7.10 : `generated/prisma/client`.)

Notes sur le schéma :
- **Carte des positions** : `GET /api/graph` = toutes les `Position` (nœuds) et les `Technique` publiées (arêtes `startPositionId → endPositionId`). Une soumission (`endPositionId = null`) est une arête terminale, affichée comme une « finition » attachée au nœud de départ. Pas de table supplémentaire.
- **Invariant** : `category = submission` ⇔ `endPositionId = null`. Il est vérifié dans le schéma Zod (lecture et future écriture admin) ; on ne crée pas de contrainte SQL `CHECK` en phase 1 (Prisma ne les gère pas nativement, on pourra l'ajouter à la main dans une migration plus tard).
- `@@unique([techniqueId, order])` : l'admin (phase 2) remplacera **toutes** les étapes d'une technique dans une transaction (`deleteMany` puis `createMany`), ce qui évite les conflits d'unicité lors d'un réordonnancement.
- `keyPoints` et `commonMistakes` sont des `text[]` PostgreSQL : listes ordonnées et courtes, sans besoin de requêtes dessus.
- La recherche `?q=` (phase 2) passera par `ILIKE` sur `name`, puis par `unaccent` et `pg_trgm` si besoin. Rien à prévoir maintenant.
- **Portes laissées ouvertes** : un champ `access` (`free` / `premium`) pour le freemium, et un `clubId` nullable pour du contenu propre à un club, s'ajouteront par simple migration. Rien dans ce schéma ne les empêche.

### D4. Repère et conventions du format de pose `v1-11`

- Unités : **centimètres**. Repère main droite, **y vers le haut**, tatami à `y = 0`. Côté Three.js, **1 unité = 1 cm** (aucune mise à l'échelle dans le viewer).
- `me` = le pratiquant qui **exécute** la technique (pas forcément celui du dessous : sur un passage de garde, `me` est dessus). Couleur `#1D9E75`. `opponent` = `#D85A30`.
- Les suffixes `L` / `R` désignent la gauche et la droite **propres au combattant**.
- 11 articulations dans cet ordre : `head, neck, hip, elbowL, handL, elbowR, handR, kneeL, footL, kneeR, footR`.
- 9 os, tels que décrits dans `CLAUDE.md` : cou–hanche, cou–coude–main ×2, hanche–genou–pied ×2. La tête est une sphère de rayon 13 qui n'est pas reliée par un cylindre.
- `camera` est optionnelle : c'est l'angle conseillé pour l'étape. Le viewer garde la caméra libre (OrbitControls) et n'applique cet angle qu'à l'initialisation ou sur action de l'utilisateur, jamais de force pendant la lecture.

### D5. Schémas Zod de `packages/shared`

Organisation :

```
packages/shared/src/
  index.ts                 // re-exports only
  enums.ts                 // const arrays, z.enum, French labels
  common.ts                // slugSchema, apiErrorSchema
  pose/
    skeleton-v1-11.ts      // joints, bones, bounds, poseV1_11Schema
    pose.ts                // poseSchema (union), currentPoseSchema, upgradePose
  technique.ts             // techniqueSummarySchema, techniqueDetailSchema
```

#### `enums.ts`

```ts
import { z } from 'zod';

export const CATEGORIES = ['submission', 'pass', 'sweep', 'escape', 'takedown'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;
export const CATEGORY_LABELS_FR: Record<Category, string> = {
  submission: 'Soumission',
  pass: 'Passage de garde',
  sweep: 'Renversement',
  escape: 'Sortie',
  takedown: 'Projection',
};

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;
export const LEVEL_LABELS_FR: Record<Level, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
};

export const GI_MODES = ['gi', 'nogi', 'both'] as const;
export const giModeSchema = z.enum(GI_MODES);
export type GiMode = z.infer<typeof giModeSchema>;
export const GI_MODE_LABELS_FR: Record<GiMode, string> = {
  gi: 'Gi',
  nogi: 'No-gi',
  both: 'Gi et no-gi',
};

export const POSITION_ROLES = ['top', 'bottom', 'neutral'] as const;
export const positionRoleSchema = z.enum(POSITION_ROLES);
export type PositionRole = z.infer<typeof positionRoleSchema>;
export const POSITION_ROLE_LABELS_FR: Record<PositionRole, string> = {
  top: 'Dessus',
  bottom: 'Dessous',
  neutral: 'Neutre',
};

export const TECHNIQUE_STATUSES = ['draft', 'published'] as const;
export const techniqueStatusSchema = z.enum(TECHNIQUE_STATUSES);
export type TechniqueStatus = z.infer<typeof techniqueStatusSchema>;

export const CHAIN_TYPES = ['followup', 'counter', 'alternative'] as const;
export const chainTypeSchema = z.enum(CHAIN_TYPES);
export type ChainType = z.infer<typeof chainTypeSchema>;
export const CHAIN_TYPE_LABELS_FR: Record<ChainType, string> = {
  followup: 'Suite',
  counter: 'Contre',
  alternative: 'Alternative',
};
```

Garde-fou contre la dérive entre Prisma et shared : un test dans `apps/api` vérifie que chaque enum généré par Prisma (`Category`, `Level`…) a exactement les mêmes valeurs que le tableau correspondant de `shared`.

#### `common.ts`

```ts
import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid slug');

export const API_ERROR_CODES = ['bad_request', 'not_found', 'internal'] as const;
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
```

#### `pose/skeleton-v1-11.ts`

Bornes de validation (en cm). Elles sont **larges** : leur rôle est d'attraper les erreurs grossières (NaN, mètres au lieu de centimètres, articulation sous le tatami), pas de juger la biomécanique.
- x, z ∈ [−400, 400] : un tatami de compétition de 8 m centré sur l'origine.
- y ∈ [0, 260] : rien sous le tatami ; 260 couvre un bras levé debout ou un adversaire soulevé lors d'une projection.
- Caméra : chaque coordonnée dans [−2000, 2000], avec y de la position ≥ 0.

```ts
import { z } from 'zod';

export const SKELETON_V1_11 = 'v1-11';

export const JOINTS_V1_11 = [
  'head', 'neck', 'hip',
  'elbowL', 'handL', 'elbowR', 'handR',
  'kneeL', 'footL', 'kneeR', 'footR',
] as const;
export type JointV1_11 = (typeof JOINTS_V1_11)[number];

/** Segments drawn as cylinders. The head is a sphere only (radius HEAD_RADIUS_CM). */
export const BONES_V1_11 = [
  ['neck', 'hip'],
  ['neck', 'elbowL'], ['elbowL', 'handL'],
  ['neck', 'elbowR'], ['elbowR', 'handR'],
  ['hip', 'kneeL'], ['kneeL', 'footL'],
  ['hip', 'kneeR'], ['kneeR', 'footR'],
] as const satisfies ReadonlyArray<readonly [JointV1_11, JointV1_11]>;

export const HEAD_RADIUS_CM = 13;

export const FIGHTERS = ['me', 'opponent'] as const;
export type FighterId = (typeof FIGHTERS)[number];
export const FIGHTER_COLORS: Record<FighterId, string> = { me: '#1D9E75', opponent: '#D85A30' };

export const POSE_BOUNDS_CM = {
  x: { min: -400, max: 400 },
  y: { min: 0, max: 260 },
  z: { min: -400, max: 400 },
} as const;

// z.number() rejects NaN and ±Infinity in Zod 4.
const coord = (b: { min: number; max: number }) => z.number().min(b.min).max(b.max);

export const jointPositionSchema = z.tuple([
  coord(POSE_BOUNDS_CM.x),
  coord(POSE_BOUNDS_CM.y),
  coord(POSE_BOUNDS_CM.z),
]);
export type Vec3 = z.infer<typeof jointPositionSchema>;

// Explicit keys (not built from JOINTS_V1_11) to keep precise inferred types.
// A unit test asserts Object.keys(shape) equals JOINTS_V1_11.
export const fighterPoseV1_11Schema = z.strictObject({
  head: jointPositionSchema,
  neck: jointPositionSchema,
  hip: jointPositionSchema,
  elbowL: jointPositionSchema,
  handL: jointPositionSchema,
  elbowR: jointPositionSchema,
  handR: jointPositionSchema,
  kneeL: jointPositionSchema,
  footL: jointPositionSchema,
  kneeR: jointPositionSchema,
  footR: jointPositionSchema,
});
export type FighterPoseV1_11 = z.infer<typeof fighterPoseV1_11Schema>;

const camCoord = z.number().min(-2000).max(2000);
export const cameraSchema = z.strictObject({
  position: z.tuple([camCoord, z.number().min(0).max(2000), camCoord]),
  target: z.tuple([camCoord, camCoord, camCoord]),
});
export type CameraHint = z.infer<typeof cameraSchema>;

export const poseV1_11Schema = z.strictObject({
  skeleton: z.literal(SKELETON_V1_11),
  fighters: z.strictObject({
    me: fighterPoseV1_11Schema,
    opponent: fighterPoseV1_11Schema,
  }),
  camera: cameraSchema.optional(),
});
export type PoseV1_11 = z.infer<typeof poseV1_11Schema>;
```

Ce qu'on ne valide **pas** strictement : la longueur des os (constance d'une étape à l'autre) et les interpénétrations. Ce seront des **avertissements** de l'éditeur en phase 2 (une fonction `poseWarnings(pose)` dans `shared`), pas des erreurs bloquantes : les poses du prototype, placées à l'œil, ne passeraient pas.

#### `pose/pose.ts` : union versionnée

```ts
import { z } from 'zod';
import { poseV1_11Schema, type PoseV1_11, SKELETON_V1_11 } from './skeleton-v1-11';

/** Every skeleton version still readable from storage. */
export const poseSchema = z.discriminatedUnion('skeleton', [poseV1_11Schema]);
export type Pose = z.infer<typeof poseSchema>;

/** The only version the API returns and the admin accepts on write. */
export const CURRENT_SKELETON = SKELETON_V1_11;
export const currentPoseSchema = poseV1_11Schema;
export type CurrentPose = PoseV1_11;

/** Upgrades any stored pose to the current skeleton. Pure, no I/O. */
export function upgradePose(pose: Pose): CurrentPose {
  switch (pose.skeleton) {
    case 'v1-11':
      return pose;
    // future: case 'v1-11' -> v2_xx(pose), chained version by version
  }
}
```

#### `technique.ts` : réponse de `GET /api/techniques/:slug`

```ts
import { z } from 'zod';
import { slugSchema } from './common';
import { categorySchema, chainTypeSchema, giModeSchema, levelSchema, positionRoleSchema } from './enums';
import { currentPoseSchema } from './pose/pose';

const label = z.string().min(1).max(120);

export const positionSummarySchema = z.strictObject({
  slug: slugSchema,
  name: label,
  role: positionRoleSchema,
});
export type PositionSummary = z.infer<typeof positionSummarySchema>;

export const tagSchema = z.strictObject({ slug: slugSchema, name: label });
export type Tag = z.infer<typeof tagSchema>;

export const techniqueSummarySchema = z.strictObject({
  slug: slugSchema,
  name: label,
  category: categorySchema,
  level: levelSchema,
  gi: giModeSchema,
});
export type TechniqueSummary = z.infer<typeof techniqueSummarySchema>;

export const stepSchema = z.strictObject({
  order: z.int().min(1),
  title: label,
  text: z.string().max(2000),
  transitionMs: z.int().min(100).max(10_000),
  pose: currentPoseSchema,
});
export type Step = z.infer<typeof stepSchema>;

export const chainSchema = z.strictObject({
  type: chainTypeSchema,
  technique: techniqueSummarySchema,
});
export type Chain = z.infer<typeof chainSchema>;

export const techniqueDetailSchema = z
  .strictObject({
    ...techniqueSummarySchema.shape,
    keyPoints: z.array(z.string().min(1).max(300)).max(20),
    commonMistakes: z.array(z.string().min(1).max(300)).max(20),
    startPosition: positionSummarySchema,
    endPosition: positionSummarySchema.nullable(),
    tags: z.array(tagSchema),
    steps: z.array(stepSchema).min(1).max(40),
    chains: z.array(chainSchema),
  })
  .refine((t) => t.steps.every((s, i) => s.order === i + 1), {
    message: 'steps must be sorted and numbered 1..n',
    path: ['steps'],
  })
  .refine((t) => (t.category === 'submission') === (t.endPosition === null), {
    message: 'a submission has no end position, any other category has one',
    path: ['endPosition'],
  });
export type TechniqueDetail = z.infer<typeof techniqueDetailSchema>;

export const techniqueSlugParamsSchema = z.strictObject({ slug: slugSchema });
```

Exemple de réponse (abrégé) :

```json
{
  "slug": "ciseau-garde-fermee",
  "name": "Ciseau depuis la garde fermée",
  "category": "sweep",
  "level": "beginner",
  "gi": "gi",
  "keyPoints": ["..."],
  "commonMistakes": ["..."],
  "startPosition": { "slug": "garde-fermee", "name": "Garde fermée", "role": "bottom" },
  "endPosition": { "slug": "montee", "name": "Montée", "role": "top" },
  "tags": [{ "slug": "fondamentaux", "name": "Fondamentaux" }],
  "steps": [
    {
      "order": 1,
      "title": "Garde fermée : contrôle du col et de la manche",
      "text": "",
      "transitionMs": 1300,
      "pose": { "skeleton": "v1-11", "fighters": { "me": { "head": [-150, 24, 0], "...": [] }, "opponent": { "...": [] } }, "camera": { "position": [170, 170, 300], "target": [0, 40, 20] } }
    }
  ],
  "chains": []
}
```

Contrat de la route :
- `200` avec un `TechniqueDetail` si la technique existe **et** est `published`.
- `404` avec `{ "error": { "code": "not_found", "message": "..." } }` si elle n'existe pas ou si c'est un brouillon (on ne révèle pas l'existence des brouillons).
- `400` avec `code: "bad_request"` si le slug ne respecte pas `slugSchema`.
- `chains` ne contient que des techniques cibles publiées.
- En-tête `Cache-Control: public, max-age=60` (utile plus tard pour la PWA et un éventuel CDN, sans risque à ce stade).

Côté front, `useTechnique(slug)` parse la réponse avec `techniqueDetailSchema` : on valide aux deux frontières.

### D6. Stratégie de versionnement du squelette

1. **Document auto-descriptif** : toute pose porte `skeleton`. La colonne `Step.skeleton` en est le miroir, écrit par l'API au même moment que `pose`, à partir de la même valeur parsée. Elle sert uniquement à trouver les poses à migrer (`WHERE skeleton <> 'v1-11'`).
2. **Version gelée** : une fois du contenu publié, `v1-11` ne change plus (liste des articulations, ordre, unités, repère, sens de L/R). Seul un ajout **optionnel** qui laisse valides les anciens documents est permis dans la même version (exemple : un champ de caméra optionnel). Tout autre changement crée une nouvelle version.
3. **Nommage** : `v<génération>-<nombre d'articulations>`, par exemple `v2-17` (avec épaules, poignets, chevilles, bassin gauche/droit). C'est un identifiant opaque : on ne fait jamais de calcul dessus.
4. **Lecture tolérante, écriture stricte** : `poseSchema` (union discriminée) accepte toutes les versions encore en base ; `currentPoseSchema` est la seule acceptée en écriture par l'admin et la seule renvoyée par l'API.
5. **Montée de version à la lecture** : l'API applique `upgradePose()` à chaque étape avant de répondre. Le front (viewer, éditeur) ne connaît **que la version courante**, et le viewer reste un composant unique.
6. **Migration des données** : quand une nouvelle version arrive, on écrit un script idempotent `apps/api/scripts/migrate-poses.ts` qui relit les étapes dont `skeleton` n'est pas la version courante, applique `upgradePose`, valide avec `currentPoseSchema` et réécrit `pose` et `skeleton` dans une transaction. Aucune migration Prisma n'est nécessaire (c'est du JSONB). Une fois la base migrée, l'ancienne version peut quitter l'union, mais la fonction de conversion reste dans l'historique git.
7. **Conversion vers un squelette plus riche** : les nouvelles articulations sont **dérivées** des anciennes (exemple : épaules = cou ± 18 cm le long de l'axe latéral du buste, estimé à partir des coudes), puis affinées dans l'éditeur. La conversion inverse (vers une version plus ancienne) n'est jamais supportée.
8. **PWA (phase 3)** : les réponses mises en cache par le service worker peuvent contenir une ancienne version. Il faudra changer le nom du cache au même moment que la migration.

## Conséquences

- Un seul endroit définit le contrat (`@tatamap/shared`) ; l'API et le web en dérivent leurs types (`z.infer`), sans aucun type écrit à la main en double.
- Le front ne gère jamais plusieurs versions de squelette.
- Les poses mal formées (articulation manquante ou en trop, NaN, y < 0, centimètres confondus avec des mètres ×100) sont rejetées au seed, à l'écriture admin et à la lecture.
- Coût : Zod parse chaque pose à chaque requête de détail. C'est négligeable (5 à 15 étapes × 22 articulations).

### Proposition de modification de `CLAUDE.md`

Dans « Modèle de données », remplacer :

```md
- **Étape** : id, ordre, titre, texte, durée de transition (ms) ; une pose
- **Pose** : id, données JSONB, version du squelette
```

par :

```md
- **Étape** : id, ordre, titre, texte, durée de transition (ms), pose (JSONB, document `Pose`), version du squelette (miroir de `pose.skeleton`)
- **Pose** : document JSON validé par Zod (`@tatamap/shared`), stocké dans l'étape (pas de table dédiée, cf. ADR 0002)
```

Ajouter après la liste des enums :

```md
- Valeurs d'enum en anglais dans le code, la base et l'API (submission, pass, sweep, escape, takedown ; beginner, intermediate, advanced ; gi, nogi, both ; top, bottom, neutral ; followup, counter, alternative), libellés français dans `@tatamap/shared`. Le rôle d'une position est exprimé du point de vue de `me`.
```

Dans « Format d'une pose », remplacer « `me` (dessous au départ, couleur #1D9E75) » par « `me` (le pratiquant qui exécute la technique, couleur #1D9E75 ; dessous au départ pour le ciseau) », et ajouter « Repère main droite, y vers le haut, 1 unité Three.js = 1 cm ; L/R = gauche/droite propres au combattant. »
