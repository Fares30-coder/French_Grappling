import type { Vec3 } from '@tatamap/shared';
import { add, cross, dot, length, scale, sub, unit } from './vec';

export type TwoBoneIk = {
  /** The middle joint (elbow or knee). */
  mid: Vec3;
  /** The end joint (hand or foot). Equals the target when it was reachable. */
  end: Vec3;
  /** False when the target was out of reach and the end joint was clamped onto the line root -> target. */
  reached: boolean;
};

// Stay just inside the reachable range so the arithmetic below never divides by ~0.
const MAX_REACH = 0.999;
const MIN_REACH = 1.001;

/**
 * Two-bone IK: places the middle joint of a chain root -> mid -> end so that the end reaches
 * `target`. `pole` is a DIRECTION (not a point): the middle joint bends toward it, as far as
 * the chain allows (it is projected on the plane perpendicular to root -> target).
 *
 * Both bone lengths are always exact. If the target is too far (or too close), the end joint
 * is clamped on the line root -> target and `reached` is false.
 */
export function twoBoneIk(root: Vec3, target: Vec3, l1: number, l2: number, pole: Vec3): TwoBoneIk {
  const toTarget = sub(target, root);
  const rawDistance = length(toTarget);
  const maxDistance = (l1 + l2) * MAX_REACH;
  const minDistance = Math.max(Math.abs(l1 - l2) * MIN_REACH, 1e-3);
  const dist = Math.min(Math.max(rawDistance, minDistance), maxDistance);
  const reached = rawDistance <= maxDistance && rawDistance >= minDistance;

  const u = unit(toTarget, unit(pole));
  const end = add(root, scale(u, dist));

  // Law of cosines: `along` = distance root -> foot of the elbow on the axis, `height` = its offset.
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const height = Math.sqrt(Math.max(l1 * l1 - along * along, 0));

  let bend = sub(pole, scale(u, dot(pole, u)));
  if (length(bend) < 1e-6) {
    // Pole parallel to the axis (or zero): any perpendicular direction will do.
    bend = cross(u, Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  }
  const mid = add(add(root, scale(u, along)), scale(unit(bend), height));
  return { mid, end, reached };
}
