import { describe, expect, it } from 'vitest';
import {
  matchesGi,
  searchKey,
  techniqueListItemSchema,
  techniqueListQuerySchema,
  techniqueMatchesQuery,
} from './catalog';
import { STARTER_POSE } from './pose/starter-pose';

describe('techniqueListQuerySchema', () => {
  it('accepts the French parameters and ignores unknown ones', () => {
    expect(
      techniqueListQuerySchema.parse({
        categorie: 'sweep',
        niveau: 'beginner',
        gi: 'nogi',
        _: '1',
      }),
    ).toEqual({ categorie: 'sweep', niveau: 'beginner', gi: 'nogi' });
  });

  it('trims q and rejects unknown enum values', () => {
    expect(techniqueListQuerySchema.parse({ q: '  clé ' }).q).toBe('clé');
    expect(techniqueListQuerySchema.safeParse({ categorie: 'soumission' }).success).toBe(false);
    expect(techniqueListQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('searchKey', () => {
  it('ignores case and accents', () => {
    expect(searchKey('Clé de bras')).toBe('cle de bras');
    expect(searchKey('Contrôle LATÉRAL')).toBe(searchKey('controle lateral'));
  });
});

describe('techniqueMatchesQuery', () => {
  const item = techniqueListItemSchema.parse({
    slug: 'cle-de-bras',
    name: 'Clé de bras',
    category: 'submission',
    level: 'beginner',
    gi: 'both',
    startPosition: { slug: 'garde-fermee', name: 'Garde fermée', role: 'bottom' },
    endPosition: null,
    tags: [{ slug: 'fondamentaux', name: 'Fondamentaux' }],
    stepCount: 6,
    preview: STARTER_POSE,
  });

  it('applies the same rules as the API', () => {
    expect(techniqueMatchesQuery(item, {})).toBe(true);
    expect(techniqueMatchesQuery(item, { categorie: 'submission', niveau: 'beginner' })).toBe(true);
    expect(techniqueMatchesQuery(item, { categorie: 'sweep' })).toBe(false);
    expect(techniqueMatchesQuery(item, { position: 'garde-fermee' })).toBe(true);
    expect(techniqueMatchesQuery(item, { position: 'demi-garde' })).toBe(false);
    expect(techniqueMatchesQuery(item, { gi: 'gi' })).toBe(true);
    expect(techniqueMatchesQuery(item, { gi: 'nogi' })).toBe(true);
    expect(techniqueMatchesQuery(item, { q: 'cle fondam' })).toBe(true);
    expect(techniqueMatchesQuery(item, { q: 'cle triangle' })).toBe(false);
  });

  it('matchesGi: both only matches both', () => {
    expect(matchesGi('gi', 'both')).toBe(false);
    expect(matchesGi('both', 'both')).toBe(true);
    expect(matchesGi('gi', 'nogi')).toBe(false);
  });
});
