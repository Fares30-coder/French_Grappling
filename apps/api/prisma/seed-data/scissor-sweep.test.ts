import { currentPoseSchema } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { buildScissorPoses, STEP_TITLES } from './scissor-sweep';

const poses = buildScissorPoses();
const pose = (i: number) => {
  const p = poses[i];
  if (!p) throw new Error(`no pose ${i}`);
  return p;
};

describe('scissor sweep seed data', () => {
  it('builds 5 poses and 5 titles', () => {
    expect(poses).toHaveLength(5);
    expect(STEP_TITLES).toHaveLength(5);
  });

  it('step 1 matches the converted prototype values', () => {
    const { me } = pose(0).fighters;
    expect(me.head).toEqual([-150, 24, 0]);
    expect(me.handL).toEqual([-10, 91, 16]);
    expect(me.footR).toEqual([45, 34, -16]);
  });

  it('step 4: me is shifted by +18 in z', () => {
    expect(pose(3).fighters.me.hip).toEqual([0, 21, 18]);
  });

  it('step 4: opponent is tilted by 55 degrees and rests at y = 6', () => {
    const { opponent } = pose(3).fighters;
    expect(opponent.head[0]).toBeCloseTo(-28, 1);
    expect(opponent.head[1]).toBeCloseTo(91.4, 1);
    expect(opponent.head[2]).toBeCloseTo(109.8, 1);
    expect(opponent.footL[0]).toBeCloseTo(72, 1);
    expect(opponent.footL[1]).toBeCloseTo(6, 1);
    expect(opponent.footL[2]).toBeCloseTo(15.7, 1);
    expect(Math.min(...Object.values(opponent).map((p) => p[1]))).toBe(6);
  });

  it('every pose passes currentPoseSchema and carries the camera', () => {
    for (const p of poses) {
      expect(currentPoseSchema.safeParse(p).success).toBe(true);
      expect(p.camera).toEqual({ position: [170, 170, 300], target: [0, 40, 20] });
    }
  });
});
