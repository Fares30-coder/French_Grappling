import { describe, expect, it } from 'vitest';
import { positionInputSchema } from './position';
import { tagInputSchema } from './tag';

describe('positionInputSchema / tagInputSchema', () => {
  const position = {
    slug: 'garde-fermee',
    name: ' Garde fermée ',
    description: '',
    role: 'bottom',
  };
  it('trims and accepts a valid position', () => {
    expect(positionInputSchema.parse(position).name).toBe('Garde fermée');
  });
  it('refuses unknown fields (id, createdAt) and bad roles', () => {
    expect(positionInputSchema.safeParse({ ...position, id: 'x' }).success).toBe(false);
    expect(positionInputSchema.safeParse({ ...position, role: 'middle' }).success).toBe(false);
    expect(
      positionInputSchema.safeParse({ ...position, description: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
  it('validates tags the same way', () => {
    expect(tagInputSchema.safeParse({ slug: 'fondamentaux', name: 'Fondamentaux' }).success).toBe(
      true,
    );
    expect(tagInputSchema.safeParse({ slug: 'Bad Slug', name: 'x' }).success).toBe(false);
    expect(tagInputSchema.safeParse({ slug: 'ab', name: 'x', extra: 1 }).success).toBe(false);
  });
});
