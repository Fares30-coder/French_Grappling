import { describe, expect, it } from 'vitest';
import {
  contentPositionsFileSchema,
  contentTagsFileSchema,
  contentTechniqueSchema,
} from './content';
import { deepClone, validPose } from './pose/fixtures';

const step = (title: string) => ({
  title,
  text: '',
  transitionMs: 1300,
  pose: deepClone(validPose),
});
const valid = () => ({
  slug: 'ciseau-test',
  name: 'Ciseau de test',
  category: 'sweep',
  level: 'beginner',
  gi: 'both',
  status: 'published',
  publishedAt: '2026-10-28T10:00:00.000Z',
  startPosition: 'garde-fermee',
  endPosition: 'montee',
  keyPoints: ['Un point clé'],
  commonMistakes: [],
  tags: ['gi'],
  steps: [step('a'), step('b')],
  chains: [{ to: 'autre-technique', type: 'followup' }],
});
const ok = (input: unknown) => contentTechniqueSchema.safeParse(input).success;

describe('contentTechniqueSchema', () => {
  it('accepts a valid technique', () => {
    expect(ok(valid())).toBe(true);
  });

  it('refuses ids, versions and unknown fields', () => {
    expect(ok({ ...valid(), id: 'x' })).toBe(false);
    expect(ok({ ...valid(), version: 1 })).toBe(false);
    expect(
      ok({ ...valid(), chains: [{ to: 'autre-technique', type: 'followup', toId: 'x' }] }),
    ).toBe(false);
  });

  it('refuses a pose with 10 joints', () => {
    const bad = valid();
    const me = bad.steps[0]?.pose.fighters.me as Record<string, unknown>;
    delete me.footR;
    expect(ok(bad)).toBe(false);
  });

  it('checks the end position, duplicates and self chains', () => {
    expect(ok({ ...valid(), endPosition: null })).toBe(false);
    expect(ok({ ...valid(), category: 'submission', endPosition: null })).toBe(true);
    expect(ok({ ...valid(), tags: ['gi', 'gi'] })).toBe(false);
    const chain = { to: 'autre-technique', type: 'followup' };
    expect(ok({ ...valid(), chains: [chain, chain] })).toBe(false);
    expect(ok({ ...valid(), chains: [{ to: 'ciseau-test', type: 'counter' }] })).toBe(false);
  });

  it('keeps a published technique publishable and dated; a draft is free', () => {
    expect(ok({ ...valid(), keyPoints: [] })).toBe(false);
    expect(ok({ ...valid(), steps: [step('a')] })).toBe(false);
    expect(ok({ ...valid(), publishedAt: null })).toBe(false);
    expect(ok({ ...valid(), status: 'draft', keyPoints: [], steps: [step('a')] })).toBe(true);
    expect(ok({ ...valid(), status: 'draft', publishedAt: null })).toBe(true);
  });
});

describe('positions and tags files', () => {
  it('refuse duplicate slugs', () => {
    const position = { slug: 'garde', name: 'Garde', description: '', role: 'bottom' };
    expect(contentPositionsFileSchema.safeParse([position]).success).toBe(true);
    expect(contentPositionsFileSchema.safeParse([position, position]).success).toBe(false);
    const tag = { slug: 'gi', name: 'Gi' };
    expect(contentTagsFileSchema.safeParse([tag, tag]).success).toBe(false);
  });
});
