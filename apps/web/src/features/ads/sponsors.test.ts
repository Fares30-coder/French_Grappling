import { describe, expect, it } from 'vitest';
import { activeSponsors, type Sponsor } from './sponsors';

const sponsor = (id: string, from: string, until: string): Sponsor => ({
  id,
  name: id,
  image: `/sponsors/${id}.png`,
  href: 'https://example.com',
  alt: id,
  from,
  until,
});

describe('activeSponsors', () => {
  const list = [
    sponsor('past', '2026-01-01', '2026-01-31'),
    sponsor('current', '2026-11-01', '2026-11-30'),
    sponsor('future', '2026-12-01', '2026-12-31'),
  ];

  it('keeps only the campaigns covering today', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(activeSponsors(list, now).map((s) => s.id)).toEqual(['current']);
  });

  it('includes the first and the last day', () => {
    expect(activeSponsors(list, new Date('2026-11-01T00:00:00Z'))).toHaveLength(1);
    expect(activeSponsors(list, new Date('2026-11-30T23:59:59Z'))).toHaveLength(1);
  });
});
