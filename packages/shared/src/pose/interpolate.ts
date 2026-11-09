import {
  CURRENT_BONE_CHAIN,
  CURRENT_ROOT_JOINT,
  type CurrentFighterPose,
  type CurrentJoint,
  type CurrentPose,
} from './pose';
import { FIGHTERS, type FighterId, HAND_SIDES, type HandSide, type Vec3 } from './skeleton-v1-11';
import type { Thumbs } from './skeleton-v2-21';

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
 * Interpolates the root (pelvis) linearly, then each bone of CURRENT_BONE_CHAIN: its direction along a great circle and its length
 * linearly. Moving joints in straight lines instead shortens a limb mid-transition (the hand cuts
 * the corner when the arm swings); this way a limb keeps its length and swings. No joint goes
 * lower than at both steps (the arc would go through the mat): there, its bone stretches a little.
 */
export function interpolateFighter(
  a: CurrentFighterPose,
  b: CurrentFighterPose,
  s: number,
): CurrentFighterPose {
  // Filled bone by bone below (the root first, every other joint once), so the cast is safe.
  const root = CURRENT_ROOT_JOINT;
  const out = { [root]: lerpVec3(a[root], b[root], s) } as Record<CurrentJoint, Vec3>;
  for (const [parent, child] of CURRENT_BONE_CHAIN) {
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
    const joint = add(out[parent], offset);
    // A turning bone sweeps an arc that can dip into the mat (a shin swinging under the knee):
    // a joint never goes lower than the lower of its two steps; what hangs off it follows.
    joint[1] = Math.max(joint[1], Math.min(a[child][1], b[child][1]));
    out[child] = joint;
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

/**
 * A hand's thumb direction for the renderer, and how much it overrides the automatic one
 * (1 = fully; 0 = not at all). Only a pose's own `thumbs` have weight 1; a transition fades it.
 */
export type ThumbHint = { dir: Vec3; weight: number };
export type ThumbHints = Partial<Record<FighterId, Partial<Record<HandSide, ThumbHint>>>>;

const unitOf = (a: Vec3): Vec3 => scale(a, 1 / norm(a));

/** A pose's thumbs as hints of full weight. */
export function thumbHints(thumbs: Thumbs | undefined): ThumbHints {
  return interpolateThumbs(thumbs, thumbs, 0);
}

/**
 * Thumb hints between two steps at eased time `s` (as interpolatePose): a direction both steps
 * give turns along a great circle; one only one step gives fades in (or out) against the
 * automatic direction, which the renderer works out from the arm.
 */
export function interpolateThumbs(
  a: Thumbs | undefined,
  b: Thumbs | undefined,
  s: number,
): ThumbHints {
  const out: ThumbHints = {};
  for (const fighter of FIGHTERS) {
    for (const side of HAND_SIDES) {
      const from = a?.[fighter]?.[side];
      const to = b?.[fighter]?.[side];
      let hint: ThumbHint | null = null;
      if (from && to) hint = { dir: slerpUnit(unitOf(from), unitOf(to), s), weight: 1 };
      else if (from && s < 1) hint = { dir: unitOf(from), weight: 1 - s };
      else if (to && s > 0) hint = { dir: unitOf(to), weight: s };
      if (hint) out[fighter] = { ...out[fighter], [side]: hint };
    }
  }
  return out;
}
