import { z } from 'zod';
import { hasNoDuplicates, labelInputSchema, listItemInputSchema } from './admin/common';
import { positionInputSchema } from './admin/position';
import { publishIssues } from './admin/publish';
import { tagInputSchema } from './admin/tag';
import { stepInputSchema } from './admin/technique';
import { slugSchema } from './common';
import {
  categorySchema,
  chainTypeSchema,
  giModeSchema,
  levelSchema,
  techniqueStatusSchema,
} from './enums';
import { END_POSITION_MESSAGE, hasConsistentEndPosition } from './technique';

/**
 * Exported content (`pnpm content:export`, files of the private repo tatamap-content): the admin
 * model without ids or version, with every reference expressed as a slug. Import is an upsert by
 * slug, so the same files can be loaded into any database.
 */

export const contentPositionSchema = positionInputSchema;
export type ContentPosition = z.infer<typeof contentPositionSchema>;

export const contentTagSchema = tagInputSchema;
export type ContentTag = z.infer<typeof contentTagSchema>;

export const contentChainSchema = z.strictObject({ to: slugSchema, type: chainTypeSchema });
export type ContentChain = z.infer<typeof contentChainSchema>;

export const contentTechniqueSchema = z
  .strictObject({
    slug: slugSchema,
    name: labelInputSchema,
    category: categorySchema,
    level: levelSchema,
    gi: giModeSchema,
    status: techniqueStatusSchema,
    publishedAt: z.iso.datetime().nullable(),
    startPosition: slugSchema,
    endPosition: slugSchema.nullable(),
    keyPoints: z.array(listItemInputSchema).max(20),
    commonMistakes: z.array(listItemInputSchema).max(20),
    tags: z.array(slugSchema).max(20),
    steps: z.array(stepInputSchema).min(1).max(40),
    chains: z.array(contentChainSchema).max(30),
  })
  .refine((t) => hasConsistentEndPosition(t.category, t.endPosition !== null), {
    message: END_POSITION_MESSAGE,
    path: ['endPosition'],
  })
  .refine((t) => hasNoDuplicates(t.tags, (s) => s), { message: 'duplicate tag', path: ['tags'] })
  .refine((t) => hasNoDuplicates(t.chains, (c) => `${c.to}:${c.type}`), {
    message: 'duplicate chain',
    path: ['chains'],
  })
  .refine((t) => t.chains.every((c) => c.to !== t.slug), {
    message: 'a technique cannot chain to itself',
    path: ['chains'],
  })
  .refine((t) => t.status === 'draft' || t.publishedAt !== null, {
    message: 'a published technique has a publishedAt date',
    path: ['publishedAt'],
  })
  .refine((t) => t.status === 'draft' || publishIssues(t).length === 0, {
    message: 'a published technique must be publishable (2 steps, 1 key point)',
    path: ['status'],
  });
export type ContentTechnique = z.infer<typeof contentTechniqueSchema>;

/** positions.json and tags.json: arrays with unique slugs. */
export const contentPositionsFileSchema = z
  .array(contentPositionSchema)
  .refine((items) => hasNoDuplicates(items, (p) => p.slug), { message: 'duplicate slug' });
export const contentTagsFileSchema = z
  .array(contentTagSchema)
  .refine((items) => hasNoDuplicates(items, (t) => t.slug), { message: 'duplicate slug' });
