import { describe, expect, it } from 'vitest';
import { validPose } from './pose/fixtures';
import { techniqueDetailSchema } from './technique';

const summary = {
  slug: 'ciseau-garde-fermee',
  name: 'Ciseau depuis la garde fermée',
  category: 'sweep',
  level: 'beginner',
  gi: 'gi',
};
const step = (order: number) => ({
  order,
  title: `Étape ${order}`,
  text: '',
  transitionMs: 1300,
  pose: validPose,
});
const base = () => ({
  ...summary,
  keyPoints: ['a'],
  commonMistakes: ['b'],
  startPosition: { slug: 'garde-fermee', name: 'Garde fermée', role: 'bottom' },
  endPosition: { slug: 'montee', name: 'Montée', role: 'top' },
  tags: [{ slug: 'fondamentaux', name: 'Fondamentaux' }],
  steps: [step(1), step(2)],
  chains: [],
});

describe('techniqueDetailSchema', () => {
  it('accepts a valid technique', () => {
    expect(techniqueDetailSchema.safeParse(base()).success).toBe(true);
  });

  it('rejects steps numbered 1, 3', () => {
    expect(techniqueDetailSchema.safeParse({ ...base(), steps: [step(1), step(3)] }).success).toBe(
      false,
    );
  });

  it('rejects a submission with an end position', () => {
    expect(techniqueDetailSchema.safeParse({ ...base(), category: 'submission' }).success).toBe(
      false,
    );
  });

  it('accepts a submission without end position', () => {
    const t = { ...base(), category: 'submission', endPosition: null };
    expect(techniqueDetailSchema.safeParse(t).success).toBe(true);
  });

  it('rejects a sweep without end position', () => {
    expect(techniqueDetailSchema.safeParse({ ...base(), endPosition: null }).success).toBe(false);
  });

  it('rejects an unknown root field', () => {
    expect(techniqueDetailSchema.safeParse({ ...base(), id: 'x' }).success).toBe(false);
  });
});
