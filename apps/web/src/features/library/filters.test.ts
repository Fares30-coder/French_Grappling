import { describe, expect, it } from 'vitest';
import { hasFilters, readFilters, withFilter } from './filters';

describe('library filters in the URL', () => {
  it('reads valid filters and drops invalid ones individually', () => {
    const params = new URLSearchParams('categorie=sweep&niveau=expert&gi=gi&q=%20cle%20&x=1');
    expect(readFilters(params)).toEqual({ categorie: 'sweep', gi: 'gi', q: 'cle' });
  });

  it('sets and removes a filter without touching the others', () => {
    const params = new URLSearchParams('categorie=sweep&q=cle');
    expect(withFilter(params, 'gi', 'nogi').toString()).toBe('categorie=sweep&q=cle&gi=nogi');
    expect(withFilter(params, 'categorie', undefined).toString()).toBe('q=cle');
    expect(params.toString()).toBe('categorie=sweep&q=cle');
  });

  it('knows when no filter is active', () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ q: 'x' })).toBe(true);
  });
});
