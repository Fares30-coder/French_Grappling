import { z } from 'zod';
import { slugSchema } from './common';
import {
  categorySchema,
  chainTypeSchema,
  giModeSchema,
  levelSchema,
  positionRoleSchema,
} from './enums';
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
