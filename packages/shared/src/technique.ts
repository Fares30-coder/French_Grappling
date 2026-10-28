import { z } from 'zod';
import { slugSchema } from './common';
import {
  type Category,
  categorySchema,
  chainTypeSchema,
  giModeSchema,
  levelSchema,
  positionRoleSchema,
} from './enums';
import { currentPoseSchema } from './pose/pose';

export const labelSchema = z.string().min(1).max(120);
export const listItemSchema = z.string().min(1).max(300);
export const transitionMsSchema = z.int().min(100).max(10_000);
export const stepTextSchema = z.string().max(2000);

export const positionSummarySchema = z.strictObject({
  slug: slugSchema,
  name: labelSchema,
  role: positionRoleSchema,
});
export type PositionSummary = z.infer<typeof positionSummarySchema>;

export const tagSchema = z.strictObject({ slug: slugSchema, name: labelSchema });
export type Tag = z.infer<typeof tagSchema>;

export const techniqueSummarySchema = z.strictObject({
  slug: slugSchema,
  name: labelSchema,
  category: categorySchema,
  level: levelSchema,
  gi: giModeSchema,
});
export type TechniqueSummary = z.infer<typeof techniqueSummarySchema>;

export const stepSchema = z.strictObject({
  order: z.int().min(1),
  title: labelSchema,
  text: stepTextSchema,
  transitionMs: transitionMsSchema,
  pose: currentPoseSchema,
});
export type Step = z.infer<typeof stepSchema>;

export const chainSchema = z.strictObject({
  type: chainTypeSchema,
  technique: techniqueSummarySchema,
});
export type Chain = z.infer<typeof chainSchema>;

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
export type TechniqueDetail = z.infer<typeof techniqueDetailSchema>;

export const techniqueSlugParamsSchema = z.strictObject({ slug: slugSchema });
