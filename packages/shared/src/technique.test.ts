import { describe, expect, it } from 'vitest';
import { validPose } from './pose/fixtures';
import {
  hasConsistentEndPosition,
  isNumberedFrom1,
  techniqueDetailBaseSchema,
  techniqueDetailSchema,
} from './technique';

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

describe('isNumberedFrom1', () => {
  it.each([
    [[], true],
    [[1, 2], true],
    [[2], false],
    [[1, 3], false],
  ])('%j -> %s', (orders, expected) => {
    expect(isNumberedFrom1(orders.map((order) => ({ order })))).toBe(expected);
  });
});

describe('hasConsistentEndPosition', () => {
  it.each([
    ['submission', false, true],
    ['submission', true, false],
    ['sweep', true, true],
    ['sweep', false, false],
  ] as const)('%s with end position %s -> %s', (category, hasEnd, expected) => {
    expect(hasConsistentEndPosition(category, hasEnd)).toBe(expected);
  });
});

describe('techniqueDetailBaseSchema', () => {
  it('stays derivable (pick, shape)', () => {
    const slugOnly = techniqueDetailBaseSchema.pick({ slug: true });
    expect(slugOnly.safeParse({ slug: 'ciseau' }).success).toBe(true);
    expect(Object.keys(techniqueDetailBaseSchema.shape)).toContain('steps');
  });
});
