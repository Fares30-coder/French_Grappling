import { describe, expect, it } from 'vitest';
import { deepClone, validCurrentPose, validPose } from './fixtures';
import { currentPoseSchema, poseSchema, upgradePose } from './pose';
import {
  BONES_V1_11,
  fighterPoseV1_11Schema,
  JOINTS_V1_11,
  poseV1_11Schema,
} from './skeleton-v1-11';
import {
  BONE_CHAIN_V2_21,
  BONES_V2_21,
  fighterPoseV2_21Schema,
  JOINTS_V2_21,
  MIRRORED_JOINT_V2_21,
  type PoseV2_21,
} from './skeleton-v2-21';

const clone = (): PoseV2_21 => deepClone(validCurrentPose);
// Mutable loose view used to build invalid inputs on purpose.
type Loose = { skeleton: string; fighters: Record<string, Record<string, unknown>> };
const loose = (): Loose => deepClone(validCurrentPose) as unknown as Loose;

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

  it('is still readable from storage', () => {
    expect(poseV1_11Schema.safeParse(validPose).success).toBe(true);
    expect(poseSchema.safeParse(validPose).success).toBe(true);
    expect(currentPoseSchema.safeParse(validPose).success).toBe(false);
  });
});

describe('skeleton v2-21', () => {
  it('fighter schema keys equal JOINTS_V2_21, in order', () => {
    expect(Object.keys(fighterPoseV2_21Schema.shape)).toEqual([...JOINTS_V2_21]);
    expect(JOINTS_V2_21).toHaveLength(21);
  });

  it('every bone references existing joints', () => {
    for (const [a, b] of BONES_V2_21) {
      expect(JOINTS_V2_21).toContain(a);
      expect(JOINTS_V2_21).toContain(b);
    }
  });

  it('the bone chain reaches every joint once, parents first, from the pelvis', () => {
    const reached = new Set<string>(['pelvis']);
    for (const [parent, child] of BONE_CHAIN_V2_21) {
      expect(reached.has(parent)).toBe(true);
      expect(reached.has(child)).toBe(false);
      reached.add(child);
    }
    expect([...reached].sort()).toEqual([...JOINTS_V2_21].sort());
  });

  it('left/right counterparts are an involution', () => {
    for (const joint of JOINTS_V2_21) {
      expect(MIRRORED_JOINT_V2_21[MIRRORED_JOINT_V2_21[joint]]).toBe(joint);
    }
    expect(MIRRORED_JOINT_V2_21.handTipL).toBe('handTipR');
    expect(MIRRORED_JOINT_V2_21.pelvis).toBe('pelvis');
  });
});

describe('currentPoseSchema', () => {
  it('accepts a valid pose', () => {
    expect(currentPoseSchema.safeParse(validCurrentPose).success).toBe(true);
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
    (p.fighters.me as Record<string, unknown>).hip = [0, 100, 0];
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects a negative y', () => {
    const p = clone();
    p.fighters.me.footL = [0, -1, 0];
    expect(currentPoseSchema.safeParse(p).success).toBe(false);
  });

  it('rejects NaN', () => {
    const p = clone();
    p.fighters.me.pelvis = [Number.NaN, 10, 0];
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

  it('accepts hand states, all optional', () => {
    const p = { ...clone(), hands: { me: { L: 'grip', R: 'push' }, opponent: { R: 'free' } } };
    expect(currentPoseSchema.safeParse(p).success).toBe(true);
    expect(currentPoseSchema.safeParse({ ...clone(), hands: {} }).success).toBe(true);
  });

  it('accepts thumb directions, all optional, of any length', () => {
    const thumbs = { me: { L: [0, -2, 0.5] }, opponent: { R: [-0.6, 0.3, -1] } };
    expect(currentPoseSchema.safeParse({ ...clone(), thumbs }).success).toBe(true);
    expect(currentPoseSchema.safeParse({ ...clone(), thumbs: {} }).success).toBe(true);
  });

  it('rejects a thumb direction too short to point anywhere, or an unknown side', () => {
    for (const thumbs of [
      { me: { L: [0, 0, 0] } },
      { me: { L: [0, 0.05, 0] } },
      { me: { M: [0, 1, 0] } },
    ]) {
      expect(currentPoseSchema.safeParse({ ...clone(), thumbs }).success).toBe(false);
    }
  });

  it('rejects an unknown hand state, side or fighter', () => {
    for (const hands of [{ me: { L: 'pinch' } }, { me: { M: 'grip' } }, { third: { L: 'grip' } }]) {
      expect(currentPoseSchema.safeParse({ ...clone(), hands }).success).toBe(false);
    }
  });
});

describe('upgradePose', () => {
  it('returns a current pose unchanged', () => {
    const parsed = poseSchema.parse(validCurrentPose);
    expect(upgradePose(parsed)).toEqual(validCurrentPose);
  });

  it('upgrades a v1-11 pose to a valid current pose', () => {
    const upgraded = upgradePose(poseSchema.parse(validPose));
    expect(upgraded.skeleton).toBe('v2-21');
    expect(currentPoseSchema.safeParse(upgraded).success).toBe(true);
  });
});
