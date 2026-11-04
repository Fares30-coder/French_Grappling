import {
  type CurrentFighterPose,
  type CurrentJoint,
  type CurrentPose,
  FIGHTERS,
  type FighterId,
  HEAD_RADIUS_CM,
  interpolateFighter,
  type Vec3,
} from '@tatamap/shared';
import { closestPoints } from './analyze';
import { add, cross, distance, dot, length, scale, sub, unit } from './vec';

/**
 * Body volume of a v2-21 fighter as capsules, sized like the Blender mannequin
 * (tools/blender/tatamap_humanoid.py: RADII): shoulders, hip joints, chest, fingertips and toes
 * are the pose's own points; the wrist is 7 cm before the hand point. The torso is two
 * side-by-side capsules, so it is wider than deep like the mannequin's.
 */

/**
 * Orthonormal body frame: up = pelvis -> neck, left = across the hip joints (the thighs give the
 * facing if the hip joints sit on the spine), forward = left x up.
 */
export function bodyFrame(f: CurrentFighterPose): { up: Vec3; fwd: Vec3; left: Vec3 } {
  const up = unit(sub(f.neck, f.pelvis));
  const across = sub(f.hipL, f.hipR);
  let left = sub(across, scale(up, dot(across, up)));
  if (length(left) < 3) {
    const thighs = sub(add(f.kneeL, f.kneeR), scale(f.pelvis, 2));
    let fwd = sub(thighs, scale(up, dot(thighs, up)));
    if (length(fwd) < 3) fwd = sub([1, 0, 0], scale(up, up[0]));
    left = cross(up, unit(fwd, [0, 0, 1]));
  }
  left = unit(left, [0, 0, -1]);
  return { up, fwd: unit(cross(left, up)), left };
}

/**
 * A capsule end: a weighted sum of joints plus a fixed offset. The weights tell `separateBodies`
 * which joints to move when that end must move.
 */
export type CapsuleEnd = { point: Vec3; joints: ReadonlyArray<readonly [CurrentJoint, number]> };
export type Capsule = {
  part: string;
  a: CapsuleEnd;
  b: CapsuleEnd;
  radius: number;
  /** Centre line of a part made of several capsules (the torso): which side something is on. */
  core?: readonly [Vec3, Vec3];
};

const at = (f: CurrentFighterPose, joint: CurrentJoint, offset: Vec3 = [0, 0, 0]): CapsuleEnd => ({
  point: add(f[joint], offset),
  joints: [[joint, 1]],
});
const between = (
  f: CurrentFighterPose,
  from: CurrentJoint,
  to: CurrentJoint,
  k: number,
  offset: Vec3 = [0, 0, 0],
): CapsuleEnd => ({
  point: add(add(scale(f[from], 1 - k), scale(f[to], k)), offset),
  joints: [
    [from, 1 - k],
    [to, k],
  ],
});

const WRIST_CM = 7;

export function bodyCapsules(f: CurrentFighterPose): Capsule[] {
  const { up, left } = bodyFrame(f);
  const side = (cm: number, upCm = 0) => add(scale(left, cm), scale(up, upCm));
  const capsules: Capsule[] = [];
  const core = [f.pelvis, f.chest] as const;
  for (const sign of [1, -1]) {
    capsules.push({
      part: 'torso',
      a: at(f, 'pelvis', side(4 * sign)),
      b: at(f, 'chest', side(5.5 * sign)),
      radius: 12,
      core,
    });
  }
  capsules.push(
    { part: 'chest', a: at(f, 'chest'), b: at(f, 'neck', side(0, -3)), radius: 10 },
    { part: 'shoulders', a: at(f, 'shoulderL'), b: at(f, 'shoulderR'), radius: 7 },
    { part: 'neck', a: at(f, 'neck'), b: between(f, 'neck', 'head', 0.4), radius: 6 },
    { part: 'head', a: at(f, 'head'), b: at(f, 'head'), radius: HEAD_RADIUS_CM },
  );
  for (const s of ['L', 'R'] as const) {
    const elbow = `elbow${s}` as const;
    const hand = `hand${s}` as const;
    const forearm = Math.max(distance(f[elbow], f[hand]), WRIST_CM + 1);
    capsules.push(
      { part: `upperArm${s}`, a: at(f, `shoulder${s}`), b: at(f, elbow), radius: 5.2 },
      {
        part: `forearm${s}`,
        a: at(f, elbow),
        b: between(f, elbow, hand, 1 - WRIST_CM / forearm),
        radius: 4.2,
      },
      {
        part: `hand${s}`,
        a: between(f, elbow, hand, 1 - WRIST_CM / forearm),
        b: at(f, `handTip${s}`),
        radius: 3.5,
      },
      { part: `thigh${s}`, a: at(f, `hip${s}`), b: at(f, `knee${s}`), radius: 7.5 },
      { part: `shin${s}`, a: at(f, `knee${s}`), b: at(f, `foot${s}`), radius: 5 },
      { part: `foot${s}`, a: at(f, `foot${s}`), b: at(f, `toe${s}`), radius: 3.5 },
    );
  }
  return capsules;
}

/** Bodies may sink this deep into each other before it is reported: flesh, the gi and grips squash. */
export const PENETRATION_TOLERANCE_CM = 3;

export type Penetration = {
  /** e.g. "me forearmR x opponent torso". */
  between: string;
  depthCm: number;
  /** Fighter and capsule of each side, and the closest points (for `separateBodies`). */
  sides: readonly [PenetrationSide, PenetrationSide];
};
export type PenetrationSide = { fighter: FighterId; capsule: Capsule; t: number; point: Vec3 };

/** Arm or leg a part belongs to (`armL`, `legR`), `trunk` or `head`. */
function limbOf(part: string): string {
  const limb = /^(upperArm|forearm|hand|thigh|shin|foot)(L|R)$/.exec(part);
  if (!limb) return part === 'head' ? 'head' : 'trunk';
  return `${['thigh', 'shin', 'foot'].includes(limb[1] ?? '') ? 'leg' : 'arm'}${limb[2]}`;
}
/** Far ends of the limbs: unlike an upper arm or a thigh, they never start inside the trunk. */
const DISTAL = /^(forearm|hand|shin|foot)[LR]$/;

/**
 * Whether two parts of the same fighter may not sink into each other: two different limbs (an
 * arm through one's own thigh), a far limb part and the trunk, or a limb and the head (the upper
 * arm excepted: it rises next to the head).
 */
function selfPair(a: string, b: string): boolean {
  const [la, lb] = [limbOf(a), limbOf(b)];
  if (la === lb) return false;
  const isLimb = (l: string) => l !== 'trunk' && l !== 'head';
  if (isLimb(la) && isLimb(lb)) return true;
  if (la === 'head' || lb === 'head') {
    const other = la === 'head' ? b : a;
    return isLimb(limbOf(other)) && !other.startsWith('upperArm');
  }
  return DISTAL.test(la === 'trunk' ? b : a);
}

/**
 * Pairs of body parts that sink deeper than `toleranceCm` into each other: every part of one
 * fighter against every part of the other, and a fighter's own parts that cannot overlap
 * (selfPair). Only the deepest pair per part pair is kept (the torso is two capsules). Deepest first.
 */
export function bodyPenetrations(
  pose: CurrentPose,
  toleranceCm = PENETRATION_TOLERANCE_CM,
): Penetration[] {
  const caps = Object.fromEntries(
    FIGHTERS.map((f) => [f, bodyCapsules(pose.fighters[f])]),
  ) as Record<FighterId, Capsule[]>;
  const pairs: Array<[FighterId, Capsule, FighterId, Capsule]> = [];
  for (const a of caps.me) for (const b of caps.opponent) pairs.push(['me', a, 'opponent', b]);
  for (const f of FIGHTERS) {
    caps[f].forEach((a, i) => {
      for (const b of caps[f].slice(i + 1)) if (selfPair(a.part, b.part)) pairs.push([f, a, f, b]);
    });
  }
  const deepest = new Map<string, Penetration>();
  for (const [fa, ca, fb, cb] of pairs) {
    const { s, t, p, q } = closestPoints(ca.a.point, ca.b.point, cb.a.point, cb.b.point);
    const depthCm = ca.radius + cb.radius - distance(p, q);
    if (depthCm <= toleranceCm) continue;
    const name = `${fa} ${ca.part} x ${fb} ${cb.part}`;
    const known = deepest.get(name);
    if (known && known.depthCm >= depthCm) continue;
    deepest.set(name, {
      between: name,
      depthCm,
      sides: [
        { fighter: fa, capsule: ca, t: s, point: p },
        { fighter: fb, capsule: cb, t, point: q },
      ],
    });
  }
  return [...deepest.values()].sort((x, y) => y.depthCm - x.depthCm);
}

/** Deepest penetration of a pose, 0 when nothing goes past the tolerance. */
export const maxPenetration = (pose: CurrentPose, toleranceCm = PENETRATION_TOLERANCE_CM): number =>
  bodyPenetrations(pose, toleranceCm)[0]?.depthCm ?? 0;

/** Points checked inside a transition, as fractions of it. */
export const TRANSITION_SAMPLES = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] as const;

/** The pose shown at fraction `s` of the transition from a to b (bones turned, as on the site). */
export function poseBetween(a: CurrentPose, b: CurrentPose, s: number): CurrentPose {
  const fighters = Object.fromEntries(
    FIGHTERS.map((f) => [f, interpolateFighter(a.fighters[f], b.fighters[f], s)]),
  ) as CurrentPose['fighters'];
  return { skeleton: a.skeleton, fighters };
}

/** Deepest penetration inside the transition from a to b (the ends excluded), with where it is. */
export function transitionPenetration(
  a: CurrentPose,
  b: CurrentPose,
  toleranceCm = PENETRATION_TOLERANCE_CM,
): (Penetration & { at: number }) | null {
  let worst: (Penetration & { at: number }) | null = null;
  for (const at of TRANSITION_SAMPLES) {
    const deepest = bodyPenetrations(poseBetween(a, b, at), toleranceCm)[0];
    if (deepest && (!worst || deepest.depthCm > worst.depthCm)) worst = { ...deepest, at };
  }
  return worst;
}
