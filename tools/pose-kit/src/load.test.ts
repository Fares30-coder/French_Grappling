import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTechnique, resolveTechniqueFile } from './load';

describe('resolveTechniqueFile', () => {
  it('maps a slug into CONTENT_DIR/techniques', () => {
    process.env.CONTENT_DIR = '/data/content';
    expect(resolveTechniqueFile('ciseau-garde-fermee')).toBe(
      '/data/content/techniques/ciseau-garde-fermee.json',
    );
  });

  it('rejects anything that is neither a slug nor a path', () => {
    expect(() => resolveTechniqueFile('..%2f..')).toThrow();
    expect(() => resolveTechniqueFile('Not A Slug')).toThrow();
  });

  it('takes a path as is', () => {
    expect(resolveTechniqueFile('/tmp/x.json')).toBe('/tmp/x.json');
  });
});

describe('loadTechnique', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pose-kit-'));

  it('reports unreadable files and schema errors', () => {
    expect(loadTechnique(path.join(dir, 'missing.json')).ok).toBe(false);
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ slug: 'x' }));
    const result = loadTechnique(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1);
  });
});
