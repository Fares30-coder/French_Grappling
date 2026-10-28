import { currentPoseSchema, type StepInput } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { buildScissorPoses } from '../../prisma/seed-data/scissor-sweep';
import { toStepCreateData } from './step-data';

const validPose = currentPoseSchema.parse(buildScissorPoses()[0]);

const steps: StepInput[] = [1, 2, 3].map((n) => ({
  title: `Étape ${n}`,
  text: `texte ${n}`,
  transitionMs: 1000 + n,
  pose: validPose,
}));

describe('toStepCreateData', () => {
  const rows = toStepCreateData('tech-id', steps);

  it('numbers steps 1..n from the array index', () => {
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3]);
  });

  it('mirrors pose.skeleton and sets the technique id everywhere', () => {
    for (const row of rows) {
      expect(row.skeleton).toBe(validPose.skeleton);
      expect(row.techniqueId).toBe('tech-id');
    }
  });

  it('sets exactly the expected fields', () => {
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['order', 'pose', 'skeleton', 'techniqueId', 'text', 'title', 'transitionMs'].sort(),
      );
    }
  });
});
