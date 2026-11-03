import { describe, expect, it } from 'vitest';
import {
  BONE_CHAIN_V1_11,
  interpolateFighter,
  interpolatePose,
  lerpVec3,
  slerpUnit,
  smoothstep,
} from './interpolate';
import type { CurrentPose } from './pose';
import { JOINTS_V1_11, type Vec3 } from './skeleton-v1-11';

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

const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('slerpUnit', () => {
  it('turns at constant speed and stays unit length', () => {
    const v = slerpUnit([1, 0, 0], [0, 1, 0], 0.5);
    expect(v[0]).toBeCloseTo(Math.SQRT1_2);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2);
    expect(Math.hypot(...v)).toBeCloseTo(1);
  });

  it('stays finite and unit length between opposite vectors', () => {
    for (const t of [0, 0.25, 0.5, 1]) {
      const v = slerpUnit([0, 0, 1], [0, 0, -1], t);
      expect(Math.hypot(...v)).toBeCloseTo(1);
      expect(v.every(Number.isFinite)).toBe(true);
    }
    expect(slerpUnit([0, 0, 1], [0, 0, -1], 1)[2]).toBeCloseTo(-1);
  });
});

describe('interpolateFighter', () => {
  // Arm raised forward (z) at a, sideways (x) at b: a 90° swing around the shoulder line.
  const a = makePose(0).fighters.me;
  const b = { ...a };
  a.elbowL = [a.neck[0], a.neck[1], a.neck[2] + 30];
  a.handL = [a.neck[0], a.neck[1], a.neck[2] + 55];
  b.elbowL = [a.neck[0] + 30, a.neck[1], a.neck[2]];
  b.handL = [a.neck[0] + 55, a.neck[1], a.neck[2]];

  it('keeps every bone length mid-transition', () => {
    for (const s of [0.25, 0.5, 0.75]) {
      const mid = interpolateFighter(a, b, s);
      for (const [parent, child] of BONE_CHAIN_V1_11) {
        expect(dist(mid[child], mid[parent])).toBeCloseTo(dist(a[child], a[parent]));
      }
    }
  });

  it('swings the hand on its arc instead of cutting the corner', () => {
    const mid = interpolateFighter(a, b, 0.5);
    // A straight line would put the hand 38.9 cm from the neck; the arm is 55 cm long.
    expect(dist(mid.handL, a.neck)).toBeCloseTo(55);
    expect(mid.handL[0] - a.neck[0]).toBeCloseTo(55 * Math.SQRT1_2);
  });

  it('moves the hip in a straight line and gives back the poses at the ends', () => {
    const moved = { ...b, hip: [b.hip[0] + 20, b.hip[1], b.hip[2]] as Vec3 };
    expect(interpolateFighter(a, moved, 0.5).hip[0]).toBeCloseTo(a.hip[0] + 10);
    const end = interpolateFighter(a, b, 1);
    for (const joint of JOINTS_V1_11) {
      expect(dist(end[joint], b[joint])).toBeCloseTo(0);
    }
  });

  it('lists every joint but the hip once as a child', () => {
    const children = BONE_CHAIN_V1_11.map(([, child]) => child).sort();
    expect(children).toEqual(JOINTS_V1_11.filter((j) => j !== 'hip').sort());
  });
});
