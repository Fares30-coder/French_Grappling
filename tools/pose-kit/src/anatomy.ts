import {
  type CurrentFighterPose,
  type CurrentPose,
  FIGHTERS,
  type FighterId,
  type Vec3,
} from '@tatamap/shared';
import { add, cross, dot, length, scale, sub, unit } from './vec';
import { poseBetween, TRANSITION_SAMPLES } from './volume';

/**
 * Joint ranges a human body cannot leave: a back folded in two, a knee or elbow bent the wrong
 * way, a leg or arm twisted round, a foot turned backwards, a head looking behind. Measured on
 * the bare skeleton, in the same body frame as the viewer's rig (apps/web/src/features/viewer/
 * rig.ts): the mesh twists a thigh or an upper arm towards its knee or elbow point, so a knee
 * placed behind the hip-ankle line shows as a leg turned round.
 *
 * Limits are deliberately past the normal range (grappling bodies bend a lot): anything reported
 * is wrong, not just unusual. Warnings stay warnings, but the animator's rule is zero of them.
 */
export const ANATOMY_LIMITS = {
  /** Bend between the lower (pelvis -> chest) and upper (chest -> neck) spine, any direction. */
  spineBendDeg: 60,
  /** Backward part of that bend (arching): a back bends forward far more than backwards. */
  spineArchDeg: 30,
  /** Shoulder line turned from the hip line, about the spine. */
  spineTwistDeg: 60,
  /** Hip line or shoulder line not square to its half of the spine (a dislocated pelvis or chest). */
  girdleTiltDeg: 40,
  /** Thigh twisted about itself from its no-twist swing (hip rotation; a knee turned round). */
  legTwistDeg: 75,
  /** Thigh behind the body's plane (hip extension; a thigh out to the side is in the plane). */
  hipExtensionDeg: 40,
  /** Knee or elbow folded shut: smallest angle between the two bones (seiza is ~20 degrees). */
  minKneeAngleDeg: 15,
  minElbowAngleDeg: 18,
  /** Foot turned about the shin, away from where the knee points (also a foot bent backwards). */
  footTwistDeg: 75,
  /** Angle between shin and foot: below it the toes go through the shin. A pointed foot is fine. */
  minAnkleDeg: 50,
  /** Fingers bent from the forearm at the wrist (open hands only: a grip curls the fingertips). */
  wristBendDeg: 100,
  /** Face turned from the chest's forward, about the neck. */
  headTurnDeg: 95,
  /** Head tilted sideways from the upper spine (ear towards the shoulder). */
  headTiltDeg: 50,
} as const;

export type AnatomyIssue = {
  fighter: FighterId;
  /** e.g. "spine bend", "kneeL twisted". */
  what: string;
  degrees: number;
  limitDeg: number;
  /** "max" when the angle must stay under the limit, "min" over it. */
  bound: 'max' | 'min';
};

const DEG = 180 / Math.PI;
const angle = (a: Vec3, b: Vec3): number => {
  const n = length(a) * length(b);
  return n < 1e-9 ? 0 : Math.acos(Math.min(1, Math.max(-1, dot(a, b) / n))) * DEG;
};
/** `a` without its component along unit `axis`. */
const flat = (a: Vec3, axis: Vec3): Vec3 => sub(a, scale(axis, dot(a, axis)));
/** Signed angle from a to b about unit `axis` (both flattened first), in degrees. */
const turnAbout = (a: Vec3, b: Vec3, axis: Vec3): number => {
  const fa = flat(a, axis);
  const fb = flat(b, axis);
  if (length(fa) < 1e-6 || length(fb) < 1e-6) return 0;
  return Math.atan2(dot(axis, cross(fa, fb)), dot(fa, fb)) * DEG;
};

/** Rotates v by the shortest rotation taking unit `from` to unit `to` (Rodrigues). */
function swing(v: Vec3, from: Vec3, to: Vec3): Vec3 {
  const c = dot(from, to);
  const k = cross(from, to);
  if (c < -0.9999) return scale(v, -1); // opposite: rest pose of the limb, undefined, flip
  const s = 1 / (1 + c);
  // v' = v c + (k x v) + k (k.v) / (1 + c)
  return add(add(scale(v, c), cross(k, v)), scale(k, dot(k, v) * s));
}

/** The viewer's body frame: up along the spine, forward square to the hip line. */
export function bodyAxes(f: CurrentFighterPose): { up: Vec3; fwd: Vec3; left: Vec3 } {
  const up = unit(sub(f.neck, f.pelvis));
  let across = flat(sub(f.hipL, f.hipR), up);
  if (length(across) < 3) {
    const thighs = sub(add(f.kneeL, f.kneeR), scale(f.pelvis, 2));
    const fwd = unit(flat(thighs, up), [1, 0, 0]);
    across = cross(up, fwd);
  }
  const left = unit(across);
  return { up, fwd: unit(cross(left, up)), left };
}

/** Where a mid joint points, off the root-end line; null when the limb is (almost) straight. */
function bendDir(root: Vec3, mid: Vec3, end: Vec3, minOffCm = 4): Vec3 | null {
  const off = sub(mid, scale(add(root, end), 0.5));
  const along = unit(sub(end, root));
  const side = flat(off, along);
  return length(side) < minOffCm ? null : unit(side);
}

/** Limb direction in the torso frame -> world, and back. */
const toLocal = (d: Vec3, ax: ReturnType<typeof bodyAxes>): Vec3 => [
  dot(d, ax.left),
  dot(d, ax.up),
  dot(d, ax.fwd),
];
const toWorld = (d: Vec3, ax: ReturnType<typeof bodyAxes>): Vec3 =>
  add(add(scale(ax.left, d[0]), scale(ax.up, d[1])), scale(ax.fwd, d[2]));

/**
 * Twist of a limb's top bone: angle about it from the rig's no-twist roll (the rest roll swung
 * along with the limb) to where the mid joint points (`bend`), both world vectors.
 */
function limbTwist(
  bone: Vec3,
  bend: Vec3,
  ax: ReturnType<typeof bodyAxes>,
  restDir: Vec3,
  restRoll: Vec3,
): number {
  const local = unit(toLocal(bone, ax));
  const roll = toWorld(swing(restRoll, restDir, local), ax);
  return turnAbout(roll, bend, unit(bone));
}

/** Legs swing from pointing forward, the knee up (sitting), as in the rig. */
const LEG_REST: [Vec3, Vec3] = [
  [0, 0, 1],
  [0, 1, 0],
];

/** Every joint of one fighter outside the human range. */
export function fighterAnatomy(
  fighter: FighterId,
  f: CurrentFighterPose,
  hands: Partial<Record<'L' | 'R', string>> = {},
): AnatomyIssue[] {
  const out: AnatomyIssue[] = [];
  const L = ANATOMY_LIMITS;
  const over = (what: string, degrees: number, limitDeg: number) => {
    if (degrees > limitDeg) out.push({ fighter, what, degrees, limitDeg, bound: 'max' });
  };
  const under = (what: string, degrees: number, limitDeg: number) => {
    if (degrees < limitDeg) out.push({ fighter, what, degrees, limitDeg, bound: 'min' });
  };
  const ax = bodyAxes(f);

  // Back.
  const lower = sub(f.chest, f.pelvis);
  const upper = sub(f.neck, f.chest);
  over('spine bend', angle(lower, upper), L.spineBendDeg);
  const lowerUnit = unit(lower);
  const fwdLow = unit(flat(ax.fwd, lowerUnit), ax.fwd);
  const arch = Math.atan2(-dot(upper, fwdLow), dot(upper, lowerUnit)) * DEG;
  over('spine arched back', arch, L.spineArchDeg);
  const hipLine = sub(f.hipL, f.hipR);
  const shoulderLine = sub(f.shoulderL, f.shoulderR);
  over(
    'spine twist (shoulders vs hips)',
    Math.abs(turnAbout(hipLine, shoulderLine, ax.up)),
    L.spineTwistDeg,
  );
  over('pelvis tilt', Math.abs(90 - angle(hipLine, lower)), L.girdleTiltDeg);
  over('shoulder line tilt', Math.abs(90 - angle(shoulderLine, upper)), L.girdleTiltDeg);

  // Head: the face turned from the chest's forward.
  const chestUp = unit(upper);
  const chestFwd = cross(unit(shoulderLine), chestUp);
  over('head turned', Math.abs(turnAbout(chestFwd, sub(f.nose, f.head), chestUp)), L.headTurnDeg);
  const neckToHead = sub(f.head, f.neck);
  const tilt =
    Math.atan2(Math.abs(dot(neckToHead, unit(shoulderLine))), dot(neckToHead, chestUp)) * DEG;
  over('head tilted sideways', tilt, L.headTiltDeg);

  for (const s of ['L', 'R'] as const) {
    const hip = f[`hip${s}`];
    const knee = f[`knee${s}`];
    const foot = f[`foot${s}`];
    const toe = f[`toe${s}`];
    const thigh = sub(knee, hip);
    const shin = sub(foot, knee);

    // Knee folded shut; thigh behind the body's plane (out to the side stays in the plane).
    under(`knee${s} folded`, 180 - angle(thigh, shin), L.minKneeAngleDeg);
    const behind = Math.asin(Math.min(1, Math.max(-1, -dot(unit(thigh), ax.fwd)))) * DEG;
    over(`hip${s} extended (thigh behind the back)`, behind, L.hipExtensionDeg);

    // Knee pointing the wrong way: the thigh twisted round from its swing.
    const kneeDir = bendDir(hip, knee, foot);
    if (kneeDir)
      over(
        `knee${s} turned round (leg twisted)`,
        Math.abs(limbTwist(thigh, kneeDir, ax, ...LEG_REST)),
        L.legTwistDeg,
      );

    // Foot: angle to the shin, and turned away from the knee.
    const footVec = sub(toe, foot);
    const ankle = angle(scale(shin, -1), footVec);
    under(`ankle${s} (toes into the shin)`, ankle, L.minAnkleDeg);
    if (kneeDir) {
      // Front of the shin: away from the back of the knee's bend.
      const shinAxis = unit(shin);
      const shinFront = flat(kneeDir, shinAxis);
      if (length(flat(footVec, shinAxis)) > 3 && length(shinFront) > 1e-3) {
        over(
          `foot${s} turned (vs the knee)`,
          Math.abs(turnAbout(shinFront, footVec, shinAxis)),
          L.footTwistDeg,
        );
      }
    }

    // Arm.
    const shoulder = f[`shoulder${s}`];
    const elbow = f[`elbow${s}`];
    const hand = f[`hand${s}`];
    const upperArm = sub(elbow, shoulder);
    const fore = sub(hand, elbow);
    under(`elbow${s} folded`, 180 - angle(upperArm, fore), L.minElbowAngleDeg);
    // No twist check on the upper arm: the shoulder reaches one direction by several paths
    // (Codman's paradox), so a swing reference flags normal arms (a hand on the own chest).
    if (hands[s] !== 'grip') {
      over(`wrist${s} bent`, angle(fore, sub(f[`handTip${s}`], hand)), L.wristBendDeg);
    }
  }
  return out;
}

/** Anatomy issues of both fighters of a pose. */
export const poseAnatomy = (pose: CurrentPose): AnatomyIssue[] =>
  FIGHTERS.flatMap((fighter) =>
    fighterAnatomy(fighter, pose.fighters[fighter], pose.hands?.[fighter] ?? {}),
  );

const issueKey = (i: AnatomyIssue) => `${i.fighter} ${i.what}`;
/** How far past its limit an issue is, in degrees. */
const excess = (i: AnatomyIssue) =>
  i.bound === 'max' ? i.degrees - i.limitDeg : i.limitDeg - i.degrees;

/**
 * Issues that appear inside the transition from a to b (bones turned, as on the site) but at
 * neither end: a knee that flips through the wrong side, a back folded halfway. Worst sample of
 * each, with where it is.
 */
export function transitionAnatomy(
  a: CurrentPose,
  b: CurrentPose,
): Array<AnatomyIssue & { at: number }> {
  const ends = new Set([...poseAnatomy(a), ...poseAnatomy(b)].map(issueKey));
  const worst = new Map<string, AnatomyIssue & { at: number }>();
  for (const at of TRANSITION_SAMPLES) {
    for (const issue of poseAnatomy(poseBetween(a, b, at))) {
      const key = issueKey(issue);
      if (ends.has(key)) continue;
      const before = worst.get(key);
      if (!before || excess(issue) > excess(before)) worst.set(key, { ...issue, at });
    }
  }
  return [...worst.values()];
}

/** One line per issue, for reports. */
export const formatAnatomyIssue = (i: AnatomyIssue): string =>
  `${i.fighter} ${i.what}: ${i.degrees.toFixed(0)}° (${i.bound === 'max' ? 'keep <=' : 'keep >='} ${i.limitDeg}°)`;
