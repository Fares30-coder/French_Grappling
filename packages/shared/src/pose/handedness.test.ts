import { describe, expect, it } from 'vitest';
import { mirrorPose } from './edit';
import { deepClone, validPose } from './fixtures';
import { handednessScore, mirroredFighters } from './handedness';
import type { FighterPoseV1_11 } from './skeleton-v1-11';
import { STARTER_POSE } from './starter-pose';

/** Same points, L/R names swapped: the mirror image of the body. */
const swapSides = (f: FighterPoseV1_11): FighterPoseV1_11 => ({
  ...f,
  elbowL: f.elbowR,
  handL: f.handR,
  kneeL: f.kneeR,
  footL: f.footR,
  elbowR: f.elbowL,
  handR: f.handL,
  kneeR: f.kneeL,
  footR: f.footL,
});

describe('handednessScore', () => {
  it('is positive for the starter pose (left side towards -z when facing +x)', () => {
    expect(handednessScore(STARTER_POSE.fighters.me)).toBeGreaterThan(10);
    expect(handednessScore(STARTER_POSE.fighters.opponent)).toBeGreaterThan(10);
  });

  it('changes sign when the L/R names are swapped', () => {
    const me = STARTER_POSE.fighters.me;
    expect(handednessScore(swapSides(me))).toBeCloseTo(-(handednessScore(me) ?? 0), 6);
  });

  it('is null when the thighs give no facing (legs straight along the spine)', () => {
    const me = deepClone(STARTER_POSE.fighters.me);
    me.kneeL = [-50, 50, -5];
    me.kneeR = [-50, 50, 5];
    expect(handednessScore(me)).toBeNull();
  });
});

describe('mirroredFighters', () => {
  it('is empty for the starter pose and stays so through mirrorPose', () => {
    expect(mirroredFighters(STARTER_POSE)).toEqual([]);
    expect(mirroredFighters(mirrorPose(STARTER_POSE))).toEqual([]);
  });

  it('flags the prototype scissor sweep, whose `me` on his back has L joints on his right', () => {
    expect(mirroredFighters(validPose)).toEqual(['me']);
    const fixed = deepClone(validPose);
    fixed.fighters.me = swapSides(fixed.fighters.me);
    expect(mirroredFighters(fixed)).toEqual([]);
  });
});
