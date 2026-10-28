import { describe, expect, it } from 'vitest';
import { deepClone, validPose } from '../pose/fixtures';
import { publishIssues } from './publish';
import { type AdminTechnique, adminTechniqueSchema, techniqueUpdateInputSchema } from './technique';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const step = (title = 'Étape') => ({
  title,
  text: 'texte',
  transitionMs: 1300,
  pose: deepClone(validPose),
});
const validUpdate = () => ({
  slug: 'ciseau-test',
  name: 'Ciseau de test',
  category: 'sweep',
  level: 'beginner',
  gi: 'both',
  startPositionId: id(1),
  endPositionId: id(2),
  keyPoints: ['Un point clé'],
  commonMistakes: [],
  tagIds: [id(3)],
  steps: [step('Départ'), step('Arrivée')],
  chains: [{ toId: id(4), type: 'followup' }],
  version: 1,
});

const ok = (input: unknown) => techniqueUpdateInputSchema.safeParse(input).success;

describe('techniqueUpdateInputSchema', () => {
  it('accepts a valid technique', () => {
    expect(ok(validUpdate())).toBe(true);
  });

  it('refuses a submission with an end position, and a non-submission without one', () => {
    expect(ok({ ...validUpdate(), category: 'submission' })).toBe(false);
    expect(ok({ ...validUpdate(), category: 'submission', endPositionId: null })).toBe(true);
    expect(ok({ ...validUpdate(), endPositionId: null })).toBe(false);
  });

  it('refuses duplicate tags and duplicate chains', () => {
    expect(ok({ ...validUpdate(), tagIds: [id(3), id(3)] })).toBe(false);
    const chain = { toId: id(4), type: 'followup' };
    expect(ok({ ...validUpdate(), chains: [chain, chain] })).toBe(false);
    expect(ok({ ...validUpdate(), chains: [chain, { ...chain, type: 'counter' }] })).toBe(true);
  });

  it('refuses 0 and 41 steps', () => {
    expect(ok({ ...validUpdate(), steps: [] })).toBe(false);
    expect(ok({ ...validUpdate(), steps: Array.from({ length: 40 }, () => step()) })).toBe(true);
    expect(ok({ ...validUpdate(), steps: Array.from({ length: 41 }, () => step()) })).toBe(false);
  });

  it('refuses a step with an order, and unknown root fields', () => {
    expect(ok({ ...validUpdate(), steps: [{ ...step(), order: 1 }] })).toBe(false);
    expect(ok({ ...validUpdate(), status: 'published' })).toBe(false);
    expect(ok({ ...validUpdate(), id: id(9) })).toBe(false);
  });

  it('refuses version 0 and a title made of spaces', () => {
    expect(ok({ ...validUpdate(), version: 0 })).toBe(false);
    expect(ok({ ...validUpdate(), name: '   ' })).toBe(false);
    expect(ok({ ...validUpdate(), steps: [step('   ')] })).toBe(false);
  });

  it('trims titles, names and list items', () => {
    const parsed = techniqueUpdateInputSchema.parse({
      ...validUpdate(),
      name: '  Ciseau  ',
      keyPoints: ['  point  '],
      steps: [step('  Départ  ')],
    });
    expect(parsed.name).toBe('Ciseau');
    expect(parsed.keyPoints).toEqual(['point']);
    expect(parsed.steps[0]?.title).toBe('Départ');
  });

  it('refuses a pose with a joint out of bounds', () => {
    const bad = step();
    bad.pose.fighters.me.head = [0, -5, 0];
    expect(ok({ ...validUpdate(), steps: [bad] })).toBe(false);
  });
});

describe('adminTechniqueSchema', () => {
  it('accepts a typical output (ISO dates)', () => {
    const { version: _v, ...content } = validUpdate();
    const output: AdminTechnique = {
      ...content,
      category: 'sweep',
      level: 'beginner',
      gi: 'both',
      chains: [{ toId: id(4), type: 'followup' }],
      id: id(10),
      version: 3,
      status: 'published',
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(adminTechniqueSchema.safeParse(output).success).toBe(true);
    expect(adminTechniqueSchema.safeParse({ ...output, publishedAt: null }).success).toBe(true);
    expect(adminTechniqueSchema.safeParse({ ...output, publishedAt: 'yesterday' }).success).toBe(
      false,
    );
  });
});

describe('publishIssues', () => {
  const base = validUpdate();
  it('lists what is missing', () => {
    expect(publishIssues({ steps: [step()], keyPoints: [] })).toHaveLength(2);
    expect(publishIssues({ steps: base.steps, keyPoints: [] })).toHaveLength(1);
  });
  it('is empty for 2 steps and 1 key point', () => {
    expect(publishIssues({ steps: base.steps, keyPoints: ['x'] })).toEqual([]);
  });
});
