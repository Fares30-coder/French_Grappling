import { describe, expect, it } from 'vitest';
import {
  BONE_LENGTH_TOLERANCE,
  boneLengths,
  clampVec3,
  handState,
  JOINT_FOLLOWERS,
  mirrorPose,
  moveJoint,
  poseWarnings,
  withHandState,
} from './edit';
import { deepClone, validCurrentPose as validPose } from './fixtures';
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

  it('swaps the hand states of each fighter', () => {
    const pose = {
      ...validPose,
      hands: { me: { L: 'grip' as const }, opponent: { R: 'push' as const } },
    };
    expect(mirrorPose(pose).hands).toEqual({ me: { R: 'grip' }, opponent: { L: 'push' } });
    expect(mirrorPose(mirrorPose(pose))).toEqual(pose);
    expect('hands' in mirrorPose(validPose)).toBe(false);
  });
});

describe('withHandState', () => {
  it('sets, reads and clears a hand, dropping empty objects', () => {
    const gripped = withHandState(validPose, 'me', 'L', 'grip');
    expect(handState(gripped, 'me', 'L')).toBe('grip');
    expect(handState(gripped, 'me', 'R')).toBeUndefined();
    const both = withHandState(gripped, 'opponent', 'R', 'push');
    expect(both.hands).toEqual({ me: { L: 'grip' }, opponent: { R: 'push' } });
    const cleared = withHandState(
      withHandState(both, 'me', 'L', undefined),
      'opponent',
      'R',
      undefined,
    );
    expect('hands' in cleared).toBe(false);
    expect(cleared).toEqual(validPose);
  });

  it('does not mutate its input', () => {
    const pose = withHandState(validPose, 'me', 'L', 'grip');
    const copy = deepClone(pose);
    withHandState(pose, 'me', 'L', 'push');
    expect(pose).toEqual(copy);
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
  it('gives the 18 bones of the starter pose', () => {
    const lengths = boneLengths(STARTER_POSE.fighters.me);
    expect(Object.keys(lengths)).toHaveLength(18);
    expect(lengths['pelvis-chest']).toBeCloseTo(34);
  });
});

describe('poseWarnings', () => {
  const stretch = (factor: number) => {
    const pose = deepClone(STARTER_POSE);
    const { elbowL, handL, handTipL } = pose.fighters.me;
    const moved: [number, number, number] = [
      elbowL[0] + (handL[0] - elbowL[0]) * factor,
      elbowL[1] + (handL[1] - elbowL[1]) * factor,
      elbowL[2] + (handL[2] - elbowL[2]) * factor,
    ];
    // The fingertips go with the hand: only the forearm changes length.
    pose.fighters.me.handTipL = [
      handTipL[0] + moved[0] - handL[0],
      handTipL[1] + moved[1] - handL[1],
      handTipL[2] + moved[2] - handL[2],
    ];
    pose.fighters.me.handL = moved;
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
    expect(STARTER_POSE.fighters.opponent.head).toEqual([50, 165, 0]);
  });
});

describe('moveJoint', () => {
  const me = STARTER_POSE.fighters.me;

  it('carries the followers by the same offset, and nothing else', () => {
    const moved = moveJoint(me, 'handL', [me.handL[0] + 10, me.handL[1], me.handL[2]]);
    expect(moved.handTipL).toEqual([me.handTipL[0] + 10, me.handTipL[1], me.handTipL[2]]);
    expect(moved.elbowL).toEqual(me.elbowL);
    expect(moved.handR).toEqual(me.handR);
    const plain = moveJoint(me, 'elbowL', [0, 100, 0]);
    expect(plain.handL).toEqual(me.handL);
  });

  it('keeps everything in bounds and does not mutate its input', () => {
    const copy = deepClone(me);
    const moved = moveJoint(me, 'footL', [me.footL[0], -50, me.footL[2]]);
    expect(moved.footL[1]).toBe(0);
    expect(moved.toeL[1]).toBeGreaterThanOrEqual(0);
    expect(me).toEqual(copy);
    expect(JOINT_FOLLOWERS.pelvis).toEqual(['hipL', 'hipR']);
  });
});
