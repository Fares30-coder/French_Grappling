import { describe, expect, it } from 'vitest';
import { twoBoneIk } from './ik';
import { distance, dot, sub } from './vec';

const L1 = 30;
const L2 = 25;
const root: [number, number, number] = [10, 50, -5];

describe('twoBoneIk', () => {
  it('reaches a reachable target with exact bone lengths', () => {
    const target: [number, number, number] = [40, 20, 15];
    const { mid, end, reached } = twoBoneIk(root, target, L1, L2, [0, 1, 0]);
    expect(reached).toBe(true);
    expect(distance(end, target)).toBeLessThan(1e-9);
    expect(distance(root, mid)).toBeCloseTo(L1, 9);
    expect(distance(mid, end)).toBeCloseTo(L2, 9);
  });

  it('clamps an unreachable target onto the line, keeping the lengths exact', () => {
    const target: [number, number, number] = [200, 50, -5];
    const { mid, end, reached } = twoBoneIk(root, target, L1, L2, [0, 1, 0]);
    expect(reached).toBe(false);
    expect(distance(root, mid)).toBeCloseTo(L1, 9);
    expect(distance(mid, end)).toBeCloseTo(L2, 9);
    expect(distance(root, end)).toBeCloseTo((L1 + L2) * 0.999, 9);
    expect(end[0]).toBeGreaterThan(root[0]); // still pointing toward the target
    expect(end[1]).toBeCloseTo(50, 9);
  });

  it('clamps a target too close to the root', () => {
    const { mid, end, reached } = twoBoneIk(root, [10, 50, -5], L1, L2, [0, 1, 0]);
    expect(reached).toBe(false);
    expect(distance(root, mid)).toBeCloseTo(L1, 9);
    expect(distance(mid, end)).toBeCloseTo(L2, 9);
    expect(Number.isFinite(mid[0] + mid[1] + mid[2])).toBe(true);
  });

  it('bends toward the pole', () => {
    const target: [number, number, number] = [10, 50, 45]; // along +z
    const up = twoBoneIk(root, target, L1, L2, [0, 1, 0]);
    const down = twoBoneIk(root, target, L1, L2, [0, -1, 0]);
    expect(up.mid[1]).toBeGreaterThan(root[1]);
    expect(down.mid[1]).toBeLessThan(root[1]);
    // The pole is a direction: a component along the axis changes nothing.
    const skewed = twoBoneIk(root, target, L1, L2, [0, 1, 7]);
    expect(distance(skewed.mid, up.mid)).toBeLessThan(1e-9);
  });

  it('copes with a pole parallel to the axis', () => {
    const target: [number, number, number] = [10, 50, 45];
    const { mid, end } = twoBoneIk(root, target, L1, L2, [0, 0, 1]);
    expect(distance(root, mid)).toBeCloseTo(L1, 9);
    expect(distance(mid, end)).toBeCloseTo(L2, 9);
    // The elbow lies off the axis.
    expect(Math.abs(dot(sub(mid, root), [0, 0, 1]) / L1)).toBeLessThan(1);
  });
});
