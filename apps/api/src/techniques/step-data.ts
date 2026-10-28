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
