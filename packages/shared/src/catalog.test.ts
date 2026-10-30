import { describe, expect, it } from 'vitest';
import { searchKey, techniqueListQuerySchema } from './catalog';

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
