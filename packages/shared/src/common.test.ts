import { describe, expect, it } from 'vitest';
import { apiErrorSchema } from './common';

const error = (extra: Record<string, unknown> = {}) => ({
  error: { code: 'conflict', message: 'Stale', ...extra },
});

describe('apiErrorSchema', () => {
  it('accepts an error without reason', () => {
    expect(apiErrorSchema.safeParse(error()).success).toBe(true);
  });

  it('accepts an error with a known reason', () => {
    expect(apiErrorSchema.safeParse(error({ reason: 'version_mismatch' })).success).toBe(true);
  });

  it('rejects an unknown reason', () => {
    expect(apiErrorSchema.safeParse(error({ reason: 'because' })).success).toBe(false);
  });
});
