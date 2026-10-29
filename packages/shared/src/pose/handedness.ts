import type { CurrentPose } from './pose';
import { FIGHTERS, type FighterId, type FighterPoseV1_11, type Vec3 } from './skeleton-v1-11';

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

/** Below this, the thighs run along the spine and give no reliable "forward" (cm). */
const MIN_FORWARD_CM = 3;

/**
 * How far the L limbs sit on the fighter's own left of the R limbs, in cm (mean over elbow,
 * hand, knee and foot). Positive = labels match the body, negative = the fighter is a mirror
 * image (L joints on the right side). `null` when the facing cannot be told.
 *
 * Without shoulders the skeleton has no left/right axis of its own, so "forward" is taken from
 * the thighs (knees are in front of the torso in nearly every grappling pose), and left =
 * up x forward with up = hip -> neck. APPROXIMATE: crossed or tangled legs give small scores.
 */
export function handednessScore(fighter: FighterPoseV1_11): number | null {
  const spine = sub(fighter.neck, fighter.hip);
  const up = scale(spine, 1 / norm(spine));
  const thighs = sub(add(fighter.kneeL, fighter.kneeR), scale(fighter.hip, 2));
  const forward = sub(thighs, scale(up, dot(thighs, up)));
  const forwardLength = norm(forward);
  if (forwardLength < MIN_FORWARD_CM) return null;
  const left = cross(up, scale(forward, 1 / forwardLength));
  const leftSide = add(add(fighter.elbowL, fighter.handL), add(fighter.kneeL, fighter.footL));
  const rightSide = add(add(fighter.elbowR, fighter.handR), add(fighter.kneeR, fighter.footR));
  return dot(sub(leftSide, rightSide), left) / 4;
}

/** Score under which a fighter is reported as mirrored (cm, see `handednessScore`). */
export const MIRRORED_SCORE_CM = -15;

/**
 * Fighters whose L/R labels are clearly swapped (a mirror image of a real body). Invisible on
 * the stick figure, wrong on a humanoid mesh (ADR 0004); swapping the L/R names without moving
 * any point fixes it. Warnings, never errors.
 */
export function mirroredFighters(pose: CurrentPose): FighterId[] {
  return FIGHTERS.filter((id) => {
    const score = handednessScore(pose.fighters[id]);
    return score !== null && score < MIRRORED_SCORE_CM;
  });
}
