import { describe, expect, it } from 'vitest';
import { slugSchema } from './common';
import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Ciseau depuis la garde fermée', 'ciseau-depuis-la-garde-fermee'],
    ['Clé de bras (armbar)', 'cle-de-bras-armbar'],
    ['Œil', 'oeil'],
    ['--a  b--', 'a-b'],
    ['!', ''],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps long inputs at 100 characters without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(99)} ${'b'.repeat(50)}`); // dash lands on the cut
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug.endsWith('-')).toBe(false);
    expect(slugify('mot '.repeat(40)).length).toBeLessThanOrEqual(100);
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });

  it('produces a valid slug as soon as it has 2 characters', () => {
    for (const input of ['Ab', 'Été 2024', 'Kimura / Americana', '  x y  ', 'ÀÉÎÕÜ ñ']) {
      const slug = slugify(input);
      if (slug.length >= 2) expect(slugSchema.safeParse(slug).success).toBe(true);
    }
  });
});
