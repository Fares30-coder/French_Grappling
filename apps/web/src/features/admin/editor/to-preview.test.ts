import {
  type AdminPosition,
  type AdminTag,
  type AdminTechniqueListItem,
  STARTER_POSE,
  techniqueDetailSchema,
} from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import type { EditorTechnique } from './editor-state';
import { toPreview } from './to-preview';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const positions: AdminPosition[] = [
  { id: id(1), slug: 'garde-fermee', name: 'Garde fermée', description: '', role: 'bottom' },
  { id: id(2), slug: 'montee', name: 'Montée', description: '', role: 'top' },
];
const tags: AdminTag[] = [
  { id: id(10), slug: 'zeta', name: 'Zêta' },
  { id: id(11), slug: 'alpha', name: 'Alpha' },
];
const listItem = (
  n: number,
  name: string,
  status: 'draft' | 'published',
): AdminTechniqueListItem => ({
  id: id(n),
  slug: `technique-${n}`,
  name,
  category: 'sweep',
  level: 'beginner',
  gi: 'both',
  status,
  stepCount: 2,
  startPositionName: 'Garde fermée',
  updatedAt: '2026-10-28T10:00:00.000Z',
});
const techniques = [
  listItem(20, 'Publiée B', 'published'),
  listItem(21, 'Brouillon', 'draft'),
  listItem(22, 'Publiée A', 'published'),
];
const sources = { positions, tags, techniques };

const technique = (patch: Partial<EditorTechnique> = {}): EditorTechnique => ({
  slug: 'ciseau-test',
  name: ' Ciseau de test ',
  category: 'sweep',
  level: 'beginner',
  gi: 'both',
  startPositionId: id(1),
  endPositionId: id(2),
  keyPoints: ['Un point', '  ', ' Deux '],
  commonMistakes: [''],
  tagIds: [id(10), id(11)],
  steps: [
    { title: 'Départ', text: 'a', transitionMs: 1300, pose: STARTER_POSE },
    { title: '', text: '', transitionMs: 50, pose: STARTER_POSE },
    { title: 'Fin', text: '', transitionMs: 99_999, pose: STARTER_POSE },
  ],
  chains: [
    { toId: id(20), type: 'alternative' },
    { toId: id(21), type: 'followup' },
    { toId: id(22), type: 'followup' },
  ],
  ...patch,
});

describe('toPreview', () => {
  it('builds a TechniqueDetail that passes the public schema, with order 1..n', () => {
    const result = toPreview(technique(), sources);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(techniqueDetailSchema.safeParse(result.technique).success).toBe(true);
    expect(result.technique.steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(result.technique.name).toBe('Ciseau de test');
    expect(result.technique.startPosition).toEqual({
      slug: 'garde-fermee',
      name: 'Garde fermée',
      role: 'bottom',
    });
    expect(result.technique.endPosition?.slug).toBe('montee');
  });

  it('is lenient about unfinished input', () => {
    const result = toPreview(technique(), sources);
    if (!result.ok) throw new Error(result.reason);
    expect(result.technique.keyPoints).toEqual(['Un point', 'Deux']);
    expect(result.technique.commonMistakes).toEqual([]);
    expect(result.technique.steps[1]).toMatchObject({ title: '(sans titre)', transitionMs: 100 });
    expect(result.technique.steps[2]?.transitionMs).toBe(10_000);
  });

  it('resolves tags by name and keeps only published chain targets, in the public order', () => {
    const result = toPreview(technique(), sources);
    if (!result.ok) throw new Error(result.reason);
    expect(result.technique.tags.map((t) => t.slug)).toEqual(['alpha', 'zeta']);
    expect(result.technique.chains.map((c) => [c.type, c.technique.name])).toEqual([
      ['followup', 'Publiée A'],
      ['alternative', 'Publiée B'],
    ]);
  });

  it('gives a submission no end position, even if one is still set', () => {
    const result = toPreview(technique({ category: 'submission', endPositionId: id(2) }), sources);
    if (!result.ok) throw new Error(result.reason);
    expect(result.technique.endPosition).toBeNull();
  });

  it('explains what is missing instead of throwing', () => {
    expect(toPreview(technique({ endPositionId: null }), sources)).toEqual({
      ok: false,
      reason: "Choisis une position d'arrivée.",
    });
    expect(toPreview(technique({ startPositionId: id(99) }), sources).ok).toBe(false);
    expect(toPreview(technique({ name: '   ' }), sources).ok).toBe(false);
    expect(toPreview(technique({ slug: 'Pas Un Slug' }), sources).ok).toBe(false);
  });
});
