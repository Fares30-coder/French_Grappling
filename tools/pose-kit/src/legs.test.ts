import { STANDARD_BODY_V2_21, STARTER_POSE } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { fixPoseThighs, fixThighs } from './legs';
import { distance } from './vec';

describe('fixThighs', () => {
  it('leaves a standard thigh alone', () => {
    const f = { ...STARTER_POSE.fighters.me };
    // The starter pose's thighs are within 5 % (or brought there): run twice, second is a no-op.
    const once = fixThighs(f).fighter;
    expect(fixThighs(once).fixes).toEqual([]);
  });

  it('brings a short thigh to the standard length, the ankle and the bend kept', () => {
    const f = { ...fixThighs(STARTER_POSE.fighters.me).fighter };
    const { hipL, footL } = f;
    // Knee pulled 6 cm towards the hip: a 35 cm thigh.
    f.kneeL = [hipL[0] + 4, hipL[1] - 32, hipL[2] - 1];
    const { fighter, fixes } = fixThighs(f);
    expect(fixes.map((x) => x.side)).toEqual(['L']);
    expect(distance(fighter.hipL, fighter.kneeL)).toBeCloseTo(STANDARD_BODY_V2_21['hipL-kneeL'], 0);
    expect(distance(fighter.footL, footL)).toBeLessThan(0.1);
    // Bends forward like before (x > hip x).
    expect(fighter.kneeL[0]).toBeGreaterThan(hipL[0]);
    expect(
      fixPoseThighs({ ...STARTER_POSE, fighters: { me: fighter, opponent: f } }).fixes,
    ).toHaveLength(1);
  });

  it('keeps a kneeling knee above the mat', () => {
    const f = { ...fixThighs(STARTER_POSE.fighters.me).fighter };
    const hip = f.hipL;
    // Kneeling: knee on the mat, a short thigh, the ankle behind on the mat.
    f.kneeL = [hip[0] + 15, 6, hip[2]];
    f.hipL = [hip[0], 30, hip[2]];
    f.footL = [hip[0] - 25, 7, hip[2]];
    const { fighter } = fixThighs(f);
    expect(fighter.kneeL[1]).toBeGreaterThanOrEqual(5);
    expect(distance(fighter.hipL, fighter.kneeL)).toBeCloseTo(STANDARD_BODY_V2_21['hipL-kneeL'], 0);
  });
});
