import {
  type CurrentFighterPose,
  type CurrentPose,
  type FighterId,
  thumbHints,
} from '@tatamap/shared';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type BoneFrames, boneFrames, type RigState } from './rig';
import fixture from './rig.fixture.json';

// Bone frames computed by Blender (tools/blender/rig_fixture.py) on the scissor sweep seed poses,
// upgraded to v2-21 there (tatamap_pose.upgrade_pose): the site and the videos must pose the model
// the same way.
type Frame = [number[], number[], number[]];
type Fixture = {
  poses: CurrentPose[];
  cases: Array<{ pose: number; fighter: FighterId; bones: Record<string, Frame> }>;
  sequence: {
    fps: number;
    frames: Array<{
      me: CurrentFighterPose;
      opponent: CurrentFighterPose;
      bones: Record<string, Frame>;
    }>;
  };
};
const data = fixture as unknown as Fixture;
const other = (f: FighterId): FighterId => (f === 'me' ? 'opponent' : 'me');

/** Largest gap (cm, or unit-vector difference for the roll) between our frames and Blender's. */
function worstGap(ours: BoneFrames, blender: Record<string, Frame>) {
  expect([...ours.keys()].sort()).toEqual(Object.keys(blender).sort());
  let points = 0;
  let roll = 0;
  for (const [name, [head, tail, z]] of Object.entries(blender)) {
    const b = ours.get(name);
    if (!b) continue;
    points = Math.max(
      points,
      b.head.distanceTo(new Vector3(...head)),
      b.tail.distanceTo(new Vector3(...tail)),
    );
    roll = Math.max(
      roll,
      b.z
        .clone()
        .normalize()
        .distanceTo(new Vector3(...z).normalize()),
    );
  }
  return { points, roll };
}

describe('boneFrames (parity with the Blender mannequin)', () => {
  it('poses every bone like Blender, hands, thumbs and automatic grips included', () => {
    for (const c of data.cases) {
      const pose = data.poses[c.pose] as CurrentPose;
      const { bones } = boneFrames(pose.fighters[c.fighter], {
        other: pose.fighters[other(c.fighter)],
        hands: pose.hands?.[c.fighter],
        thumbs: thumbHints(pose.thumbs)[c.fighter],
      });
      const gap = worstGap(bones, c.bones);
      expect(gap.points, `pose ${c.pose} ${c.fighter}`).toBeLessThan(0.01);
      expect(gap.roll, `pose ${c.pose} ${c.fighter}`).toBeLessThan(1e-3);
    }
  });

  it('turns rolls, facing and hands at the same bounded speed from frame to frame', () => {
    let prev: RigState | null = null;
    for (const [i, frame] of data.sequence.frames.entries()) {
      const out = boneFrames(frame.me, {
        other: frame.opponent,
        prev,
        dtSeconds: 1 / data.sequence.fps,
      });
      prev = out.state;
      const gap = worstGap(out.bones, frame.bones);
      expect(gap.points, `frame ${i}`).toBeLessThan(0.01);
      expect(gap.roll, `frame ${i}`).toBeLessThan(1e-3);
    }
  });
});

describe('boneFrames', () => {
  const pose = data.poses[0] as CurrentPose;

  it('follows the joints: each limb bone ends on its point', () => {
    const { bones } = boneFrames(pose.fighters.me);
    const f = pose.fighters.me;
    expect(bones.get('forearm.L')?.head.distanceTo(new Vector3(...f.elbowL))).toBeCloseTo(0);
    expect(bones.get('shin.R')?.tail.distanceTo(new Vector3(...f.footR))).toBeCloseTo(0);
    expect(bones.get('head')?.head.distanceTo(new Vector3(...f.neck))).toBeGreaterThan(0);
  });

  it('turns the hand and half the forearm about the forearm towards the thumb direction', () => {
    const f = pose.fighters.me;
    const fore = new Vector3(...f.handL).sub(new Vector3(...f.elbowL)).normalize();
    const flat = (d: Vector3) =>
      d
        .clone()
        .sub(fore.clone().multiplyScalar(d.dot(fore)))
        .normalize();
    const auto = boneFrames(f).bones;
    const autoZ = flat(auto.get('hand.L')?.z as Vector3);
    // The opposite of the automatic thumb: a half turn of the hand, a quarter of the forearm.
    const wanted = autoZ.clone().negate();
    const turned = boneFrames(f, {
      thumbs: { L: { dir: [wanted.x, wanted.y, wanted.z], weight: 1 } },
    }).bones;
    const angle = (name: string) =>
      flat(turned.get(name)?.z as Vector3).angleTo(flat(auto.get(name)?.z as Vector3));
    expect(angle('hand.L')).toBeCloseTo(Math.PI, 1);
    expect(angle('forearm.L')).toBeCloseTo(Math.PI / 2, 1);
    expect(angle('upper_arm_twist.L')).toBeCloseTo(0);
    expect(turned.get('hand.L')?.tail.distanceTo(auto.get('hand.L')?.tail as Vector3)).toBeCloseTo(
      0,
    );
    // No weight: the automatic roll.
    const none = boneFrames(f, {
      thumbs: { L: { dir: [wanted.x, wanted.y, wanted.z], weight: 0 } },
    }).bones;
    expect(flat(none.get('hand.L')?.z as Vector3).angleTo(autoZ)).toBeCloseTo(0);
  });

  it('closes a gripping hand and opens a pushing one', () => {
    const fist = boneFrames(pose.fighters.me, { hands: { L: 'grip' } }).state.hand.L;
    const flat = boneFrames(pose.fighters.me, { hands: { L: 'push' } }).state.hand.L;
    expect(fist).toBe(1);
    expect(flat).toBe(-1);
  });
});
