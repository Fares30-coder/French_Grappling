import { z } from 'zod';
import { currentPoseSchema } from '../pose/pose';
import { stepTextSchema, transitionMsSchema } from '../technique';
import { labelInputSchema } from './common';

/** A step on write: no `order`, the array index is the order (see toStepCreateData in the API). */
export const stepInputSchema = z.strictObject({
  title: labelInputSchema,
  text: stepTextSchema.trim(),
  transitionMs: transitionMsSchema,
  pose: currentPoseSchema,
});
export type StepInput = z.infer<typeof stepInputSchema>;
