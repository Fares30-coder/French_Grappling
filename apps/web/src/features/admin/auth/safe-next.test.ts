import { describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN_PATH, safeNext } from './safe-next';

describe('safeNext', () => {
  it('accepts internal admin paths', () => {
    expect(safeNext('/admin/techniques/x')).toBe('/admin/techniques/x');
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('/admin/techniques?page=2#top')).toBe('/admin/techniques?page=2#top');
  });

  it('falls back for anything else', () => {
    for (const bad of [
      '//evil.test',
      '//evil.test/admin',
      'https://evil.test',
      'https://evil.test/admin',
      '/techniques/x',
      '/administrator',
      '/admin\\@evil',
      '/admin/\\evil.test',
      '/admin/ x',
      '/admin/\nx',
      '/admin//evil.test/..\\x',
      'admin/techniques',
      'javascript:alert(1)',
      '',
    ]) {
      expect(safeNext(bad), bad).toBe(DEFAULT_ADMIN_PATH);
    }
    expect(safeNext(null)).toBe(DEFAULT_ADMIN_PATH);
    expect(safeNext(undefined)).toBe(DEFAULT_ADMIN_PATH);
  });

  it('uses the given fallback', () => {
    expect(safeNext('https://evil.test', '/admin')).toBe('/admin');
  });
});
