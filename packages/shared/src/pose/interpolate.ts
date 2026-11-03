import type { CurrentPose } from './pose';
import { FIGHTERS, type FighterPoseV1_11, type JointV1_11, type Vec3 } from './skeleton-v1-11';

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

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Below this angle (rad) two directions are treated as equal, above PI minus it as opposite. */
const EPSILON_RAD = 1e-6;

/**
 * Spherical interpolation between two unit vectors. Opposite vectors have no unique great
 * circle: the turn then goes through a fixed perpendicular, so the result stays continuous in t.
 */
export function slerpUnit(a: Vec3, b: Vec3, t: number): Vec3 {
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
  if (angle < EPSILON_RAD) return a;
  if (angle > Math.PI - EPSILON_RAD) {
    // Any axis perpendicular to a: cross with the world axis a is least aligned with.
    const helper: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const axis = cross(a, helper);
    const perp = scale(cross(axis, a), 1 / norm(axis));
    return add(scale(a, Math.cos(Math.PI * t)), scale(perp, Math.sin(Math.PI * t)));
  }
  const s = Math.sin(angle);
  return add(scale(a, Math.sin((1 - t) * angle) / s), scale(b, Math.sin(t * angle) / s));
}

/**
 * Bones from the root outwards, each [parent, child]: the hip is the root, the head hangs off
 * the neck. Every joint except the hip appears exactly once as a child.
 */
export const BONE_CHAIN_V1_11 = [
  ['hip', 'neck'],
  ['neck', 'head'],
  ['neck', 'elbowL'],
  ['elbowL', 'handL'],
  ['neck', 'elbowR'],
  ['elbowR', 'handR'],
  ['hip', 'kneeL'],
  ['kneeL', 'footL'],
  ['hip', 'kneeR'],
  ['kneeR', 'footR'],
] as const satisfies ReadonlyArray<readonly [JointV1_11, JointV1_11]>;

/**
 * Interpolates the hip linearly, then each bone's direction along a great circle and its length
 * linearly. Moving joints in straight lines instead shortens a limb mid-transition (the hand cuts
 * the corner when the arm swings); this way a limb keeps its length and swings.
 */
export function interpolateFighter(
  a: FighterPoseV1_11,
  b: FighterPoseV1_11,
  s: number,
): FighterPoseV1_11 {
  // Filled bone by bone below (the hip first, every other joint once), so the cast is safe.
  const out = { hip: lerpVec3(a.hip, b.hip, s) } as Record<JointV1_11, Vec3>;
  for (const [parent, child] of BONE_CHAIN_V1_11) {
    const boneA = sub(a[child], a[parent]);
    const boneB = sub(b[child], b[parent]);
    const lengthA = norm(boneA);
    const lengthB = norm(boneB);
    // A zero-length bone has no direction: fall back to the straight line for that joint.
    const offset =
      lengthA === 0 || lengthB === 0
        ? lerpVec3(boneA, boneB, s)
        : scale(
            slerpUnit(scale(boneA, 1 / lengthA), scale(boneB, 1 / lengthB), s),
            lengthA + (lengthB - lengthA) * s,
          );
    out[child] = add(out[parent], offset);
  }
  return out;
}

/** Interpolates both fighters with smoothstep easing (see interpolateFighter). The camera hint is dropped. */
export function interpolatePose(a: CurrentPose, b: CurrentPose, t: number): CurrentPose {
  const s = smoothstep(t);
  // Exact ends: rebuilding from bones would add rounding errors to the stored poses.
  const pick = s <= 0 ? a : s >= 1 ? b : null;
  const [first, second] = FIGHTERS;
  const fighter = (id: typeof first | typeof second) =>
    pick ? pick.fighters[id] : interpolateFighter(a.fighters[id], b.fighters[id], s);
  return {
    skeleton: a.skeleton,
    fighters: {
      [first]: fighter(first),
      [second]: fighter(second),
    } as CurrentPose['fighters'],
  };
}
