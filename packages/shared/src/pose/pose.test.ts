import { describe, expect, it } from 'vitest';
import { deepClone, validPose } from './fixtures';
import { currentPoseSchema, poseSchema, upgradePose } from './pose';
import {
  BONES_V1_11,
  fighterPoseV1_11Schema,
  JOINTS_V1_11,
  type PoseV1_11,
} from './skeleton-v1-11';

const clone = (): PoseV1_11 => deepClone(validPose);
// Mutable loose view used to build invalid inputs on purpose.
type Loose = { skeleton: string; fighters: Record<string, Record<string, unknown>> };
const loose = (): Loose => deepClone(validPose) as unknown as Loose;

describe('skeleton v1-11', () => {
  it('fighter schema keys equal JOINTS_V1_11, in order', () => {
    expect(Object.keys(fighterPoseV1_11Schema.shape)).toEqual([...JOINTS_V1_11]);
  });

  it('every bone references existing joints', () => {
    for (const [a, b] of BONES_V1_11) {
      expect(JOINTS_V1_11).toContain(a);
      expect(JOINTS_V1_11).toContain(b);
    }
    expect(BONES_V1_11).toHaveLength(9);
  });
});

describe('currentPoseSchema', () => {
  it('accepts a valid pose', () => {
    expect(currentPoseSchema.safeParse(validPose).success).toBe(true);
  });

  it('accepts a pose without camera', () => {
    const { camera: _camera, ...rest } = clone();
    expect(currentPoseSchema.safeParse(rest).success).toBe(true);
  });

  it('rejects a missing joint', () => {
    const p = loose();
    delete p.fighters.me?.footR;
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects an unknown joint', () => {
    const p = loose();
    (p.fighters.me as Record<string, unknown>).shoulderL = [0, 100, 0];
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects a negative y', () => {
    const p = clone();
    p.fighters.me.footL = [0, -1, 0];
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects NaN', () => {
    const p = clone();
    p.fighters.me.hip = [Number.NaN, 10, 0];
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects out-of-range values (units converted twice)', () => {
    const p = clone();
    p.fighters.opponent.head = [10_000, 100, 0];
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects a 2-element tuple', () => {
    const p = loose();
    (p.fighters.me as Record<string, unknown>).head = [1, 2];
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects an unknown skeleton version', () => {
    const p = loose();
    p.skeleton = 'v2-17';
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
    expect(poseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects an extra fighter', () => {
    const p = loose();
    p.fighters.third = deepClone(p.fighters.me) as Record<string, unknown>;
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });
});

describe('upgradePose', () => {
  it('returns a v1-11 pose unchanged', () => {
    const parsed = poseSchema.parse(validPose);
    expect(upgradePose(parsed)).toEqual(validPose);
  });
});
