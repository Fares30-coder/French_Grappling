import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import { adminErrorMessage } from './errors';

describe('adminErrorMessage', () => {
  it('maps reasons first', () => {
    expect(adminErrorMessage(new ApiRequestError(409, 'conflict', 'x', 'version_mismatch'))).toBe(
      'Modifiée ailleurs (autre onglet).',
    );
    expect(adminErrorMessage(new ApiRequestError(409, 'conflict', 'x', 'slug_taken'))).toContain(
      'slug',
    );
    expect(adminErrorMessage(new ApiRequestError(409, 'conflict', 'x', 'slug_locked'))).toContain(
      'figé',
    );
    expect(
      adminErrorMessage(new ApiRequestError(409, 'conflict', 'x', 'not_publishable')),
    ).toContain('publiable');
  });

  it('falls back on the status, then on a generic message', () => {
    expect(adminErrorMessage(new ApiRequestError(401, 'unauthorized', 'x'))).toContain(
      'Session expirée',
    );
    expect(adminErrorMessage(new ApiRequestError(0, 'network', 'x'))).toContain('joindre');
    expect(adminErrorMessage(new ApiRequestError(500, 'internal', 'x'))).toContain('Réessaie');
    expect(adminErrorMessage(new Error('boom'))).toContain('Réessaie');
  });
});
