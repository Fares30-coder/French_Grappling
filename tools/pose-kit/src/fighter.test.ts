import {
  boneLengths,
  type FighterPoseV1_11,
  JOINTS_V1_11,
  mirrorPose,
  poseWarnings,
} from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { findContacts, jointsBelowMat, segmentDistance } from './analyze';
import {
  boneLengthsOf,
  buildFighter,
  type FighterSpec,
  makePose,
  rotateFighterX,
  translateFighter,
} from './fighter';
import { distance } from './vec';

// Same shape as a real step 1 (closed guard), coordinates in cm.
const ref: FighterPoseV1_11 = {
  head: [-150, 24, 0],
  neck: [-125, 21, 0],
  hip: [-30, 18, 0],
  elbowL: [-85, 56, 16],
  handL: [-10, 91, 16],
  elbowR: [-80, 48, -16],
  handR: [-15, 76, -16],
  kneeL: [20, 56, 16],
  footL: [52, 44, 16],
  kneeR: [15, 50, -16],
  footR: [45, 34, -16],
};
const lengths = boneLengthsOf(ref);

const spec: FighterSpec = {
  hip: [0, 40, 0],
  torsoDir: [0, 1, 0.2],
  headDir: [0, 1, 0],
  hands: {
    L: { target: [20, 60, 30], pole: [0, 1, 1] },
    R: { target: [20, 60, -30], pole: [0, 1, -1] },
  },
  feet: {
    L: { target: [30, 0, 20], pole: [1, 1, 0] },
    R: { target: [30, 0, -20], pole: [1, 1, 0] },
  },
};

describe('buildFighter', () => {
  it('keeps every reference length (poseWarnings stays empty)', () => {
    const built = buildFighter(lengths, spec);
    const a = makePose(ref, ref);
    const b = makePose(built, built);
    expect(poseWarnings(b, a)).toEqual([]);
    const got = boneLengths(built);
    const want = boneLengths(ref);
    for (const key of Object.keys(want) as Array<keyof typeof want>) {
      expect(Math.abs(got[key] - want[key])).toBeLessThan(0.2); // 0.1 cm rounding per joint
    }
    expect(Math.abs(distance(built.neck, built.head) - lengths.neckHead)).toBeLessThan(0.2);
  });

  it('puts the hands and feet on reachable targets', () => {
    const built = buildFighter(lengths, spec);
    expect(distance(built.handL, spec.hands.L.target)).toBeLessThan(0.2);
    expect(distance(built.footR, spec.feet.R.target)).toBeLessThan(0.2);
  });
});

describe('rotate / translate', () => {
  it('rotateFighterX preserves lengths and rests on yMin', () => {
    const built = buildFighter(lengths, spec);
    const turned = rotateFighterX(built, 55, 6);
    expect(Math.min(...JOINTS_V1_11.map((j) => turned[j][1]))).toBeCloseTo(6, 5);
    const a = boneLengths(built);
    const b = boneLengths(turned);
    for (const key of Object.keys(a) as Array<keyof typeof a>) {
      expect(Math.abs(a[key] - b[key])).toBeLessThan(0.3);
    }
  });

  it('rotates 90 degrees about X: y becomes z', () => {
    const f = translateFighter(buildFighter(lengths, spec), [0, 0, 0]);
    const turned = rotateFighterX(f, 90, 0); // lifted: y would go negative otherwise
    expect(
      turned.head[1] - Math.min(...JOINTS_V1_11.map((j) => turned[j][1])),
    ).toBeGreaterThanOrEqual(0);
    // Right-hand rule: y' = -z and z' = y (before any lift, so compare differences).
    expect(turned.head[2] - turned.hip[2]).toBeCloseTo(f.head[1] - f.hip[1], 0);
    expect(turned.head[1] - turned.hip[1]).toBeCloseTo(-(f.head[2] - f.hip[2]), 0);
  });

  it('translateFighter moves every joint', () => {
    const f = buildFighter(lengths, spec);
    const moved = translateFighter(f, [10, 0, -5]);
    expect(moved.hip[0]).toBeCloseTo(f.hip[0] + 10, 5);
    expect(moved.footL[2]).toBeCloseTo(f.footL[2] - 5, 5);
  });
});

describe('analysis', () => {
  it('flags joints under the mat', () => {
    const f = buildFighter(lengths, spec);
    // Built by hand: the editor helpers clamp into the schema bounds, which already forbid y < 0.
    const sunk = { ...f, handL: [0, -3, 0] as FighterPoseV1_11['handL'] };
    const pose = makePose(sunk, f);
    expect(jointsBelowMat(pose)).toEqual([{ fighter: 'me', joint: 'handL', y: -3 }]);
    const buried = makePose({ ...f, head: [0, 5, 0] }, f);
    expect(jointsBelowMat(buried).map((j) => j.joint)).toEqual(['head']);
    expect(jointsBelowMat(makePose(f, f))).toEqual([]);
  });

  it('measures segment distance', () => {
    expect(segmentDistance([0, 0, 0], [10, 0, 0], [5, 3, -5], [5, 3, 5])).toBeCloseTo(3, 9);
    expect(segmentDistance([0, 0, 0], [10, 0, 0], [20, 0, 0], [30, 0, 0])).toBeCloseTo(10, 9);
  });

  it('detects a limb through the other fighter torso, not one beside it', () => {
    const me = buildFighter(lengths, spec);
    const through = translateFighter(me, [0, 0, 0]);
    const far = mirrorPose(makePose(me, me)).fighters.opponent;
    const apart = makePose(me, translateFighter(far, [400, 0, 0]));
    expect(findContacts(apart)).toEqual([]);
    expect(findContacts(makePose(me, through)).length).toBeGreaterThan(0); // identical bodies overlap
  });
});
