import { STARTER_POSE } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { validateUpdateInput } from './validation';

const id = '00000000-0000-4000-8000-000000000001';
const valid = () => ({
  version: 1,
  slug: 'ciseau-test',
  name: 'Ciseau',
  category: 'sweep',
  level: 'beginner',
  gi: 'both',
  startPositionId: id,
  endPositionId: id,
  keyPoints: ['Un'],
  commonMistakes: [],
  tagIds: [],
  steps: [{ title: 'A', text: '', transitionMs: 1300, pose: STARTER_POSE }],
  chains: [],
});

describe('validateUpdateInput', () => {
  it('accepts a valid body', () => {
    expect(validateUpdateInput(valid())).toEqual({});
  });

  it('reports each problem under its field, in French', () => {
    const errors = validateUpdateInput({
      ...valid(),
      name: '   ',
      slug: 'Pas Un Slug',
      keyPoints: ['ok', ''],
      startPositionId: null,
      steps: [{ title: '', text: '', transitionMs: 50, pose: STARTER_POSE }],
    });
    expect(errors.name).toBe('Obligatoire.');
    expect(errors.slug).toContain('Slug invalide');
    expect(errors['keyPoints.1']).toBe('Obligatoire.');
    expect(errors.startPositionId).toBe('Choisis une position de départ.');
    expect(errors['steps.0.title']).toBe('Obligatoire.');
    expect(errors['steps.0.transitionMs']).toBe('Au moins 100 ms.');
  });

  it('asks for an end position unless the technique is a submission', () => {
    expect(validateUpdateInput({ ...valid(), endPositionId: null }).endPositionId).toContain(
      "position d'arrivée",
    );
    expect(
      validateUpdateInput({ ...valid(), category: 'submission', endPositionId: null }),
    ).toEqual({});
  });

  it('reports duplicates', () => {
    const errors = validateUpdateInput({ ...valid(), tagIds: [id, id] });
    expect(errors.tagIds).toBe('Tag en double.');
  });
});
