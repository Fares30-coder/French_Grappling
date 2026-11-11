import type { CurrentFighterPose, Vec3 } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { fighterAnatomy, poseAnatomy, transitionAnatomy } from './anatomy';
import {
  buildFighter,
  type FighterSpec,
  makePose,
  STANDARD_LENGTHS,
  translateFighter,
} from './fighter';

// Half squat, facing +x (left is -z): knees bent forward, arms forward.
const spec: FighterSpec = {
  pelvis: [0, 80, 0],
  torsoDir: [0, 1, 0],
  headDir: [0, 1, 0],
  hands: {
    L: { target: [30, 100, -25], pole: [0, -1, -1] },
    R: { target: [30, 100, 25], pole: [0, -1, 1] },
  },
  feet: {
    L: { target: [0, 8, -15], pole: [1, 0, 0] },
    R: { target: [0, 8, 15], pole: [1, 0, 0] },
  },
};
const squat = buildFighter(STANDARD_LENGTHS, spec);
const whats = (f: CurrentFighterPose) => fighterAnatomy('me', f).map((i) => i.what);

describe('fighterAnatomy', () => {
  it('passes a plain half squat', () => {
    expect(whats(squat)).toEqual([]);
  });

  it('flags a knee bent backwards (the leg turned round)', () => {
    const bad = buildFighter(STANDARD_LENGTHS, {
      ...spec,
      feet: { ...spec.feet, L: { target: [0, 8, -15], pole: [-1, 0, 0] } },
    });
    expect(whats(bad)).toContain('kneeL turned round (leg twisted)');
    expect(whats(bad)).not.toContain('kneeR turned round (leg twisted)');
  });

  it('flags a back folded in two', () => {
    const chest = squat.chest;
    const folded: CurrentFighterPose = { ...squat };
    // Upper spine folded 90 degrees forward at the chest, head and shoulders carried along.
    const fold = (p: Vec3): Vec3 => [chest[0] + (p[1] - chest[1]), chest[1], p[2]];
    for (const j of ['neck', 'head', 'nose', 'shoulderL', 'shoulderR'] as const) {
      folded[j] = fold(squat[j]);
    }
    expect(whats(folded)).toContain('spine bend');
  });

  it('flags a head dropped onto the shoulder', () => {
    const { neck } = squat;
    // Head 20 cm out to the left (-z) and only 10 cm up: ear on the shoulder.
    const bad: CurrentFighterPose = {
      ...squat,
      head: [neck[0], neck[1] + 10, neck[2] - 20],
      nose: [neck[0] + 10, neck[1] + 10, neck[2] - 20],
    };
    expect(whats(bad)).toContain('head tilted sideways');
  });

  it('flags a foot pointing backwards', () => {
    const bad: CurrentFighterPose = {
      ...squat,
      toeR: [squat.footR[0] - 15, squat.footR[1], squat.footR[2]],
    };
    expect(whats(bad)).toContain('footR turned (vs the knee)');
  });
});

describe('transitionAnatomy', () => {
  it('reports nothing between two healthy poses', () => {
    const a = makePose(squat, translateFighter(squat, [200, 0, 0]));
    const b = makePose(translateFighter(squat, [10, 0, 0]), translateFighter(squat, [200, 0, 0]));
    expect(poseAnatomy(a)).toEqual([]);
    expect(transitionAnatomy(a, b)).toEqual([]);
  });
});
