import { describe, expect, it } from 'vitest';
import { mirrorPose } from './edit';
import { validPose } from './fixtures';
import { currentPoseSchema } from './pose';
import type { FighterPoseV1_11, PoseV1_11, Vec3 } from './skeleton-v1-11';
import { JOINTS_V2_21 } from './skeleton-v2-21';
import { upgradeFighterV1toV2, upgradeV1toV2 } from './upgrade-v1-v2';
import { distance, dot, sub, unit } from './vec';

const flipZ = ([x, y, z]: Vec3): Vec3 => [x, y, 0 - z];
/** v1-11 mirror (the v1-11 version of mirrorPose, kept here for the commutation test). */
const mirrorV1 = (p: PoseV1_11): PoseV1_11 => {
  const m = (f: FighterPoseV1_11): FighterPoseV1_11 => ({
    head: flipZ(f.head),
    neck: flipZ(f.neck),
    hip: flipZ(f.hip),
    elbowL: flipZ(f.elbowR),
    handL: flipZ(f.handR),
    elbowR: flipZ(f.elbowL),
    handR: flipZ(f.handL),
    kneeL: flipZ(f.kneeR),
    footL: flipZ(f.footR),
    kneeR: flipZ(f.kneeL),
    footR: flipZ(f.footL),
  });
  return {
    skeleton: 'v1-11',
    fighters: { me: m(p.fighters.me), opponent: m(p.fighters.opponent) },
    ...(p.camera
      ? { camera: { position: flipZ(p.camera.position), target: flipZ(p.camera.target) } }
      : {}),
  };
};

describe('upgradeV1toV2', () => {
  const up = upgradeV1toV2(validPose);

  it('gives a valid current pose and keeps the camera', () => {
    expect(currentPoseSchema.safeParse(up).success).toBe(true);
    expect(up.camera).toEqual(validPose.camera);
  });

  it('keeps the v1-11 points as they are; pelvis = hip', () => {
    for (const id of ['me', 'opponent'] as const) {
      const a = validPose.fighters[id];
      const b = up.fighters[id];
      for (const j of ['head', 'neck', 'elbowL', 'elbowR', 'handL', 'handR'] as const) {
        expect(b[j]).toEqual(a[j]);
      }
      for (const j of ['kneeL', 'kneeR', 'footL', 'footR'] as const) expect(b[j]).toEqual(a[j]);
      expect(b.pelvis).toEqual(a.hip);
    }
  });

  it('commutes with the mirror, to 1 cm', () => {
    const a = mirrorPose(upgradeV1toV2(validPose));
    const b = upgradeV1toV2(mirrorV1(validPose));
    for (const id of ['me', 'opponent'] as const) {
      for (const j of JOINTS_V2_21) {
        expect(distance(a.fighters[id][j], b.fighters[id][j])).toBeLessThan(1);
      }
    }
  });

  it('places the derived points like the humanoid model', () => {
    const f = up.fighters.opponent;
    for (const s of ['L', 'R'] as const) {
      const upper = distance(f[`shoulder${s}`], f[`elbow${s}`]);
      expect(upper).toBeGreaterThanOrEqual(27 - 1e-6);
      expect(upper).toBeLessThanOrEqual(34 + 1e-6);
      expect(distance(f[`hip${s}`], f.pelvis)).toBeCloseTo(Math.hypot(9, 5));
      expect(distance(f[`hand${s}`], f[`handTip${s}`])).toBeCloseTo(8);
      expect(f[`handTip${s}`][1]).toBeGreaterThanOrEqual(-1e-9);
      // 15 cm, the tip on or above the mat (tilted up where it would go through).
      expect(distance(f[`foot${s}`], f[`toe${s}`])).toBeCloseTo(15);
      expect(f[`toe${s}`][1]).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(distance(f.pelvis, f.chest)).toBeCloseTo(34);
    expect(distance(f.head, f.nose)).toBeCloseTo(11);
  });

  it('turns the kneeling opponent towards me (the nose points at me)', () => {
    const { opponent, me } = up.fighters;
    const facing = unit(sub(opponent.nose, opponent.head));
    expect(dot(facing, unit(sub(me.pelvis, opponent.pelvis)))).toBeGreaterThan(0.5);
  });

  it('keeps every point above the mat', () => {
    const low: FighterPoseV1_11 = { ...validPose.fighters.me, footL: [52, 1, 16] };
    for (const p of Object.values(upgradeFighterV1toV2(low)))
      expect(p[1]).toBeGreaterThanOrEqual(0);
  });
});
