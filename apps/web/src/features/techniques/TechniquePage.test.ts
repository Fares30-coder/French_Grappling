import { describe, expect, it } from 'vitest';
import { stepFromParam } from './TechniquePage';

describe('stepFromParam', () => {
  it('maps the 1-based ?etape= to a step index', () => {
    expect(stepFromParam('3')).toBe(2);
    expect(stepFromParam('1')).toBe(0);
  });

  it('falls back to the first step on anything else', () => {
    for (const value of [null, '', '0', '-2', '2.5', 'abc']) expect(stepFromParam(value)).toBe(0);
  });
});
