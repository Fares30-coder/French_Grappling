import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicUrl } from './public-data';

afterEach(() => vi.unstubAllEnvs());

describe('publicUrl', () => {
  it('points to the API by default', () => {
    expect(publicUrl({ kind: 'techniques' })).toBe('/api/techniques');
    expect(publicUrl({ kind: 'technique', slug: 'a b' })).toBe('/api/techniques/a%20b');
    expect(publicUrl({ kind: 'graph' })).toBe('/api/graph');
  });

  it('points to the static files when VITE_DATA_SOURCE is static', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'static');
    expect(publicUrl({ kind: 'techniques' })).toBe('/data/v1/techniques.json');
    expect(publicUrl({ kind: 'technique', slug: 'ciseau' })).toBe(
      '/data/v1/techniques/ciseau.json',
    );
    expect(publicUrl({ kind: 'positions' })).toBe('/data/v1/positions.json');
    expect(publicUrl({ kind: 'graph' })).toBe('/data/v1/graph.json');
    expect(publicUrl({ kind: 'tags' })).toBe('/data/v1/tags.json');
  });
});
