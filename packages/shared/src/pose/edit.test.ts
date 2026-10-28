import { describe, expect, it } from 'vitest';
import { BONE_LENGTH_TOLERANCE, boneLengths, clampVec3, mirrorPose, poseWarnings } from './edit';
import { deepClone, validPose } from './fixtures';
import { currentPoseSchema } from './pose';
import { STARTER_POSE } from './starter-pose';

describe('mirrorPose', () => {
  it('is an involution', () => {
    expect(mirrorPose(mirrorPose(validPose))).toEqual(validPose);
    expect(mirrorPose(mirrorPose(STARTER_POSE))).toEqual(STARTER_POSE);
  });

  it('swaps L/R joints and inverts z, camera included', () => {
    const mirrored = mirrorPose(validPose);
    const { me } = validPose.fighters;
    expect(mirrored.fighters.me.handR).toEqual([me.handL[0], me.handL[1], 0 - me.handL[2]]);
    expect(mirrored.fighters.me.handL).toEqual([me.handR[0], me.handR[1], 0 - me.handR[2]]);
    expect(mirrored.fighters.me.head).toEqual(me.head);
    expect(mirrored.camera?.position).toEqual([170, 170, -300]);
    expect(mirrored.camera?.target).toEqual([0, 40, -20]);
  });

  it('does not mutate its input and keeps a missing camera missing', () => {
    const copy = deepClone(validPose);
    mirrorPose(copy);
    expect(copy).toEqual(validPose);
    const { camera: _c, ...noCamera } = validPose;
    expect('camera' in mirrorPose(noCamera)).toBe(false);
  });

  it('gives a pose that still passes the schema', () => {
    expect(currentPoseSchema.safeParse(mirrorPose(validPose)).success).toBe(true);
  });
});

describe('clampVec3', () => {
  it('clamps each axis into the bounds', () => {
    expect(clampVec3([0, -5, 900])).toEqual([0, 0, 400]);
    expect(clampVec3([-999, 999, -999])).toEqual([-400, 260, -400]);
    expect(clampVec3([10, 20, 30])).toEqual([10, 20, 30]);
  });
});

describe('boneLengths', () => {
  it('gives the 9 bones of the starter pose', () => {
    const lengths = boneLengths(STARTER_POSE.fighters.me);
    expect(Object.keys(lengths)).toHaveLength(9);
    expect(lengths['neck-hip']).toBe(45);
  });
});

describe('poseWarnings', () => {
  const stretch = (factor: number) => {
    const pose = deepClone(STARTER_POSE);
    const { elbowL, handL } = pose.fighters.me;
    pose.fighters.me.handL = [
      elbowL[0] + (handL[0] - elbowL[0]) * factor,
      elbowL[1] + (handL[1] - elbowL[1]) * factor,
      elbowL[2] + (handL[2] - elbowL[2]) * factor,
    ];
    return pose;
  };

  it('is empty against itself', () => {
    expect(poseWarnings(STARTER_POSE, STARTER_POSE)).toEqual([]);
  });

  it('warns for a forearm 20 % longer, not for 10 %', () => {
    const warnings = poseWarnings(stretch(1.2), STARTER_POSE);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ fighter: 'me', bone: 'elbowL-handL' });
    expect(poseWarnings(stretch(1.1), STARTER_POSE)).toEqual([]);
    expect(BONE_LENGTH_TOLERANCE).toBe(0.15);
  });
});

describe('STARTER_POSE', () => {
  it('passes the pose schema', () => {
    expect(currentPoseSchema.safeParse(STARTER_POSE).success).toBe(true);
  });
  it('faces the opponent with correct left/right', () => {
    expect(STARTER_POSE.fighters.opponent.handL[2]).toBe(0 - STARTER_POSE.fighters.me.handL[2]);
    expect(STARTER_POSE.fighters.opponent.head).toEqual([50, 160, 0]);
  });
});
