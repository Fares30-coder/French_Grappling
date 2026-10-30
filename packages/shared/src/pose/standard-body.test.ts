import { describe, expect, it } from 'vitest';
import { deepClone } from './fixtures';
import { STANDARD_BODY_V1_11, standardBodyWarnings, standardBoneLengths } from './standard-body';
import { STARTER_POSE } from './starter-pose';

describe('STANDARD_BODY_V1_11', () => {
  it('is symmetric', () => {
    expect(STANDARD_BODY_V1_11['neck-elbowL']).toBe(STANDARD_BODY_V1_11['neck-elbowR']);
    expect(STANDARD_BODY_V1_11['elbowL-handL']).toBe(STANDARD_BODY_V1_11['elbowR-handR']);
    expect(STANDARD_BODY_V1_11['hip-kneeL']).toBe(STANDARD_BODY_V1_11['hip-kneeR']);
    expect(STANDARD_BODY_V1_11['kneeL-footL']).toBe(STANDARD_BODY_V1_11['kneeR-footR']);
  });

  it('describes an adult of about 1.75 m', () => {
    const b = STANDARD_BODY_V1_11;
    const height = 8 + b['kneeL-footL'] + b['hip-kneeL'] + b['neck-hip'] + b['neck-head'] + 13;
    expect(height).toBeGreaterThan(170);
    expect(height).toBeLessThan(185);
  });
});

describe('standardBodyWarnings', () => {
  it('is empty for the starter pose, which follows the standard body', () => {
    expect(standardBodyWarnings(STARTER_POSE)).toEqual([]);
    const lengths = standardBoneLengths(STARTER_POSE.fighters.opponent);
    expect(lengths['neck-head']).toBeCloseTo(22, 0);
  });

  it('warns for a forearm 20 % too long, not for 10 %', () => {
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
    const warnings = standardBodyWarnings(stretch(1.2));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ fighter: 'me', bone: 'elbowL-handL', referenceCm: 33 });
    expect(standardBodyWarnings(stretch(1.1))).toEqual([]);
  });

  it('checks the neck -> head distance and honours the tolerance argument', () => {
    const pose = deepClone(STARTER_POSE);
    pose.fighters.opponent.head = [50, 143 + 40, 0];
    expect(standardBodyWarnings(pose).map((w) => [w.fighter, w.bone])).toEqual([
      ['opponent', 'neck-head'],
    ]);
    expect(standardBodyWarnings(pose, 1)).toEqual([]);
  });
});
