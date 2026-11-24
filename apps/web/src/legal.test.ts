import { expect, it } from 'vitest';
import { HOST, LEGAL, missingLegalFields } from './legal';

it('lists the fields left to fill', () => {
  expect(missingLegalFields({ ...LEGAL, name: 'X', status: null, siret: null })).toContain('siret');
  expect(
    missingLegalFields({
      name: 'a',
      status: 'a',
      siret: 'a',
      address: 'a',
      email: 'a',
      director: 'a',
    }),
  ).toEqual([]);
});

it('names Cloudflare as the host (ADR 0006), no personal data in the host identity', () => {
  expect(HOST.name).toBe('Cloudflare, Inc.');
  expect(HOST.address).toContain('San Francisco');
  expect(JSON.stringify(HOST)).not.toMatch(/ovh/i);
});
