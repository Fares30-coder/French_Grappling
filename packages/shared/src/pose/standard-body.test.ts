import { describe, expect, it } from 'vitest';
import { deepClone } from './fixtures';
import { STANDARD_BODY_V2_21, standardBodyWarnings, standardBoneLengths } from './standard-body';
import { STARTER_POSE } from './starter-pose';

describe('STANDARD_BODY_V2_21', () => {
  it('is symmetric', () => {
    const b = STANDARD_BODY_V2_21 as Record<string, number>;
    for (const [bone, cm] of Object.entries(b)) {
      expect(b[bone.replace(/L/g, '#').replace(/R/g, 'L').replace(/#/g, 'R')]).toBe(cm);
    }
  });

  it('describes an adult of about 1.75 m', () => {
    const b = STANDARD_BODY_V2_21;
    const spine = b['pelvis-chest'] + b['chest-neck'];
    const height = 8 + b['kneeL-footL'] + 38 + 5 + spine + b['neck-head'] + 13;
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
      const { elbowL, handL, handTipL } = pose.fighters.me;
      const moved: [number, number, number] = [
        elbowL[0] + (handL[0] - elbowL[0]) * factor,
        elbowL[1] + (handL[1] - elbowL[1]) * factor,
        elbowL[2] + (handL[2] - elbowL[2]) * factor,
      ];
      pose.fighters.me.handTipL = [
        handTipL[0] + moved[0] - handL[0],
        handTipL[1] + moved[1] - handL[1],
        handTipL[2] + moved[2] - handL[2],
      ];
      pose.fighters.me.handL = moved;
      return pose;
    };
    const warnings = standardBodyWarnings(stretch(1.2));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ fighter: 'me', bone: 'elbowL-handL', referenceCm: 33 });
    expect(standardBodyWarnings(stretch(1.1))).toEqual([]);
  });

  it('checks the neck -> head distance and honours the tolerance argument', () => {
    const pose = deepClone(STARTER_POSE);
    const { head, nose } = pose.fighters.opponent;
    pose.fighters.opponent.head = [50, 143 + 40, 0];
    pose.fighters.opponent.nose = [nose[0], nose[1] + 183 - head[1], nose[2]];
    expect(standardBodyWarnings(pose).map((w) => [w.fighter, w.bone])).toEqual([
      ['opponent', 'neck-head'],
    ]);
    expect(standardBodyWarnings(pose, 1)).toEqual([]);
  });
});
