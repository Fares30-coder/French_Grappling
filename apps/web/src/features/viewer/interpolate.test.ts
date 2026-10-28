import type { CurrentPose, Vec3 } from '@tatamap/shared';
import { JOINTS_V1_11 } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { interpolatePose, lerpVec3, smoothstep } from './interpolate';

const makePose = (offset: number): CurrentPose => {
  const fighter = (base: number) =>
    Object.fromEntries(
      JOINTS_V1_11.map((j, i) => [j, [base + i + offset, 10 + i + offset, -5 + offset] as Vec3]),
    ) as CurrentPose['fighters']['me'];
  return {
    skeleton: 'v1-11',
    fighters: { me: fighter(0), opponent: fighter(100) },
    camera: { position: [1, 2, 3], target: [0, 0, 0] },
  };
};

describe('smoothstep', () => {
  it('hits the anchor values', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
  });

  it('clamps out-of-range input', () => {
    expect(smoothstep(-3)).toBe(0);
    expect(smoothstep(7)).toBe(1);
  });
});

describe('lerpVec3', () => {
  it('interpolates linearly', () => {
    expect(lerpVec3([0, 0, 0], [10, 20, 30], 0.5)).toEqual([5, 10, 15]);
  });
});

describe('interpolatePose', () => {
  const a = makePose(0);
  const b = makePose(37.3);

  it('equals a at t = 0 and b at t = 1', () => {
    expect(interpolatePose(a, b, 0).fighters).toEqual(a.fighters);
    expect(interpolatePose(a, b, 1).fighters).toEqual(b.fighters);
  });

  it('is halfway at t = 0.5 and drops the camera', () => {
    const mid = interpolatePose(a, b, 0.5);
    expect(mid.fighters.me.head[0]).toBeCloseTo(
      (a.fighters.me.head[0] + b.fighters.me.head[0]) / 2,
    );
    expect(mid.fighters.opponent.footR[1]).toBeCloseTo(
      (a.fighters.opponent.footR[1] + b.fighters.opponent.footR[1]) / 2,
    );
    expect(mid.camera).toBeUndefined();
  });
});
