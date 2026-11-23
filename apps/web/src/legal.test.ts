import { expect, it } from 'vitest';
import { LEGAL, missingLegalFields } from './legal';

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
