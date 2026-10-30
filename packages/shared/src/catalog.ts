import { z } from 'zod';
import { slugSchema } from './common';
import { categorySchema, giModeSchema, levelSchema } from './enums';
import { currentPoseSchema } from './pose/pose';
import { positionSummarySchema, tagSchema, techniqueSummarySchema } from './technique';

// Public read contract of the library and the position map (phase 3, lot 2).
// Published techniques only; never any id.

/**
 * Query of `GET /api/techniques`. Parameter names are French, as in CLAUDE.md. Unknown parameters
 * are ignored (cache busters). `gi=gi` and `gi=nogi` also match techniques done in both.
 */
export const techniqueListQuerySchema = z.object({
  categorie: categorySchema.optional(),
  position: slugSchema.optional(),
  niveau: levelSchema.optional(),
  gi: giModeSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type TechniqueListQuery = z.infer<typeof techniqueListQuerySchema>;

export const techniqueListItemSchema = z.strictObject({
  ...techniqueSummarySchema.shape,
  startPosition: positionSummarySchema,
  endPosition: positionSummarySchema.nullable(),
  tags: z.array(tagSchema),
  stepCount: z.int().min(1),
  /** Pose of step 1, for the 3D thumbnail. */
  preview: currentPoseSchema,
});
export type TechniqueListItem = z.infer<typeof techniqueListItemSchema>;

/** Sorted by name (French collation). */
export const techniqueListSchema = z.strictObject({ techniques: z.array(techniqueListItemSchema) });
export type TechniqueList = z.infer<typeof techniqueListSchema>;

export const positionListItemSchema = z.strictObject({
  ...positionSummarySchema.shape,
  description: z.string(),
  /** Published techniques starting from this position. */
  techniqueCount: z.int().min(0),
});
export type PositionListItem = z.infer<typeof positionListItemSchema>;

/** All positions, sorted by name (French collation). */
export const positionListSchema = z.strictObject({ positions: z.array(positionListItemSchema) });
export type PositionList = z.infer<typeof positionListSchema>;

/** Tags used by at least one published technique, sorted by name. */
export const tagListSchema = z.strictObject({ tags: z.array(tagSchema) });
export type TagList = z.infer<typeof tagListSchema>;

/**
 * The position map: nodes = positions, edges = published techniques. A submission is an edge
 * without `to` (it ends the fight at `from`).
 */
export const graphEdgeSchema = z.strictObject({
  technique: techniqueSummarySchema,
  from: slugSchema,
  to: slugSchema.nullable(),
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const graphSchema = z.strictObject({
  nodes: z.array(positionListItemSchema),
  edges: z.array(graphEdgeSchema),
});
export type Graph = z.infer<typeof graphSchema>;

/** Lower case, accents removed: the key used by the `q` search ("Clé" matches "cle"). */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
