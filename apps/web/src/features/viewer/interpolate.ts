import {
  type CurrentPose,
  FIGHTERS,
  type FighterPoseV1_11,
  JOINTS_V1_11,
  type JointV1_11,
  type Vec3,
} from '@tatamap/shared';

/** Ease in/out; `t` is clamped to [0, 1]. */
export function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Linear interpolation, exact at t = 0 (returns a) and t = 1 (returns b). */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return [a[0] * u + b[0] * t, a[1] * u + b[1] * t, a[2] * u + b[2] * t];
}

function lerpFighter(a: FighterPoseV1_11, b: FighterPoseV1_11, s: number): FighterPoseV1_11 {
  // Filled joint by joint below, so the cast is safe.
  const out = {} as Record<JointV1_11, Vec3>;
  for (const joint of JOINTS_V1_11) out[joint] = lerpVec3(a[joint], b[joint], s);
  return out;
}

/** Interpolates every joint of both fighters with smoothstep easing. The camera hint is dropped. */
export function interpolatePose(a: CurrentPose, b: CurrentPose, t: number): CurrentPose {
  const s = smoothstep(t);
  const [first, second] = FIGHTERS;
  return {
    skeleton: a.skeleton,
    fighters: {
      [first]: lerpFighter(a.fighters[first], b.fighters[first], s),
      [second]: lerpFighter(a.fighters[second], b.fighters[second], s),
    } as CurrentPose['fighters'],
  };
}
