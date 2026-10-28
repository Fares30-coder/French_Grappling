import { z } from 'zod';
import { slugSchema } from '../common';
import {
  type Category,
  categorySchema,
  chainTypeSchema,
  giModeSchema,
  levelSchema,
  techniqueStatusSchema,
} from '../enums';
import { currentPoseSchema } from '../pose/pose';
import {
  END_POSITION_MESSAGE,
  hasConsistentEndPosition,
  labelSchema,
  stepTextSchema,
  transitionMsSchema,
} from '../technique';
import { hasNoDuplicates, idSchema, labelInputSchema, listItemInputSchema } from './common';

/** A step on write: no `order`, the array index is the order (see toStepCreateData in the API). */
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

/** The three predicates shared by the PUT input and the admin read model. */
const withContentRules = <S extends z.ZodType<z.infer<typeof techniqueContentBaseSchema>>>(
  schema: S,
) =>
  schema
    .refine(endPositionRule, endPositionIssue)
    .refine((t) => hasNoDuplicates(t.tagIds, (id) => id), {
      message: 'duplicate tag',
      path: ['tagIds'],
    })
    .refine((t) => hasNoDuplicates(t.chains, (c) => `${c.toId}:${c.type}`), {
      message: 'duplicate chain',
      path: ['chains'],
    });

/** PUT /api/admin/techniques/:id: full replacement, guarded by `version`. */
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
