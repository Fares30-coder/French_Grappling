import { boneLengths, type FighterPoseV1_11, handednessScore } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import {
  buildFighter,
  type FighterSpec,
  makePose,
  STANDARD_LENGTHS,
  translateFighter,
} from './fighter';
import { separateBodies, separateTechnique } from './separate';
import { distance } from './vec';
import { bodyFrame, bodyPenetrations, maxPenetration, transitionPenetration } from './volume';

// Standing, facing +x (left is -z), arms forward and down, feet apart.
const spec: FighterSpec = {
  hip: [0, 95, 0],
  torsoDir: [0, 1, 0],
  headDir: [0, 1, 0],
  hands: {
    L: { target: [30, 100, -25], pole: [0, -1, -1] },
    R: { target: [30, 100, 25], pole: [0, -1, 1] },
  },
  feet: {
    L: { target: [5, 8, -15], pole: [1, 0, 0] },
    R: { target: [5, 8, 15], pole: [1, 0, 0] },
  },
};
const me = buildFighter(STANDARD_LENGTHS, spec);
/** The same body turned half a turn to face me, `gap` cm in front (hip to hip). */
const facing = (gap: number): FighterPoseV1_11 =>
  Object.fromEntries(
    Object.entries(me).map(([j, [x, y, z]]) => [j, [gap - x, y, -z]]),
  ) as FighterPoseV1_11;

describe('bodyFrame', () => {
  it('faces where the knees point, left = up x forward', () => {
    const { up, fwd, left } = bodyFrame(me);
    expect(up[1]).toBeCloseTo(1, 1);
    expect(fwd[0]).toBeGreaterThan(0.9);
    expect(left[2]).toBeLessThan(-0.9); // y x x = -z
    expect(handednessScore(me)).toBeGreaterThan(0);
  });
});

describe('bodyPenetrations', () => {
  it('is empty for one body alone and for two bodies apart', () => {
    expect(bodyPenetrations(makePose(me, translateFighter(me, [0, 0, 300])))).toEqual([]);
  });

  it('finds two bodies sunk into each other, deepest first', () => {
    const hits = bodyPenetrations(makePose(me, facing(15)));
    expect(hits.map((h) => h.between)).toContain('me torso x opponent torso');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]?.depthCm).toBeLessThanOrEqual(hits[i - 1]?.depthCm ?? 0);
    }
  });

  it('flags a forearm through its own head', () => {
    const folded = { ...me, elbowR: [5, 175, 10], handR: [0, 150, 0] } as FighterPoseV1_11;
    const self = bodyPenetrations(makePose(folded, translateFighter(me, [0, 0, 300])));
    expect(self.map((p) => p.between)).toContain('me head x me forearmR');
  });
});

describe('separateBodies', () => {
  it('pushes two sunk bodies apart and keeps bone lengths', () => {
    const pose = makePose(me, facing(15));
    expect(maxPenetration(pose)).toBeGreaterThan(5);
    const out = separateBodies(pose);
    expect(maxPenetration(out)).toBe(0);
    const [before, after] = [boneLengths(pose.fighters.me), boneLengths(out.fighters.me)];
    for (const key of Object.keys(before) as Array<keyof typeof before>) {
      expect(Math.abs(after[key] - before[key])).toBeLessThan(0.5);
    }
    expect(distance(out.fighters.opponent.neck, out.fighters.opponent.head)).toBeCloseTo(
      distance(pose.fighters.opponent.neck, pose.fighters.opponent.head),
      0,
    );
  });

  it('leaves a clean pose as it is and never moves a joint further than the cap', () => {
    const clean = makePose(me, translateFighter(me, [0, 0, 300]));
    expect(separateBodies(clean).fighters).toEqual(clean.fighters);
    const out = separateBodies(makePose(me, facing(5)), { maxMoveCm: 4 });
    expect(distance(out.fighters.me.hip, me.hip)).toBeLessThan(4.1); // + rounding to 0.1 cm
  });

  it('also separates inside a transition', () => {
    // Clean at both steps, through my head in between.
    // He passes over me from back to front: clear at both steps, his feet through my head
    // halfway.
    // Shifted by hand: translateFighter clamps into the schema bounds.
    const over = (x: number) =>
      Object.fromEntries(
        Object.entries(me).map(([j, [px, py, pz]]) => [j, [px + x, py + 150, pz]]),
      ) as FighterPoseV1_11;
    const [a, b] = [makePose(me, over(-60)), makePose(me, over(60))];
    expect(maxPenetration(a) + maxPenetration(b)).toBe(0);
    expect(transitionPenetration(a, b)?.between).toMatch(/me head x opponent (foot|shin)/);
    const [outA, outB] = separateTechnique([a, b]);
    expect(outA && outB && transitionPenetration(outA, outB)).toBeNull();
  });
});
