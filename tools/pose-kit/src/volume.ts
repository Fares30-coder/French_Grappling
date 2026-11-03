import {
  type CurrentPose,
  FIGHTERS,
  type FighterId,
  type FighterPoseV1_11,
  HEAD_RADIUS_CM,
  interpolateFighter,
  type JointV1_11,
  type Vec3,
} from '@tatamap/shared';
import { closestPoints } from './analyze';
import { add, cross, distance, dot, length, scale, sub, unit } from './vec';

/**
 * Body volume of a v1-11 fighter as capsules, sized like the Blender mannequin
 * (tools/blender/tatamap_humanoid.py: RADII and derived_points): shoulders at neck +/- 17 cm
 * sideways and 5 cm down, hip joints at hip +/- 9 cm and 5 cm down, wrist 7 cm before the hand
 * point. The torso is two side-by-side capsules, so it is wider than deep like the mannequin's.
 */

/** Orthonormal body frame: up = hip -> neck, forward = the thighs across the spine, left = up x forward. */
export function bodyFrame(f: FighterPoseV1_11): { up: Vec3; fwd: Vec3; left: Vec3 } {
  const up = unit(sub(f.neck, f.hip));
  const thighs = sub(add(f.kneeL, f.kneeR), scale(f.hip, 2));
  let fwd = sub(thighs, scale(up, dot(thighs, up)));
  if (length(fwd) < 3) fwd = sub([1, 0, 0], scale(up, up[0]));
  fwd = unit(fwd, [0, 0, 1]);
  const left = unit(cross(up, fwd));
  return { up, fwd: cross(left, up), left };
}

/**
 * A capsule end: a weighted sum of joints plus a fixed offset. The weights tell `separateBodies`
 * which joints to move when that end must move.
 */
export type CapsuleEnd = { point: Vec3; joints: ReadonlyArray<readonly [JointV1_11, number]> };
export type Capsule = {
  part: string;
  a: CapsuleEnd;
  b: CapsuleEnd;
  radius: number;
  /** Centre line of a part made of several capsules (the torso): which side something is on. */
  core?: readonly [Vec3, Vec3];
};

const at = (f: FighterPoseV1_11, joint: JointV1_11, offset: Vec3 = [0, 0, 0]): CapsuleEnd => ({
  point: add(f[joint], offset),
  joints: [[joint, 1]],
});
const between = (
  f: FighterPoseV1_11,
  from: JointV1_11,
  to: JointV1_11,
  k: number,
  offset: Vec3 = [0, 0, 0],
): CapsuleEnd => ({
  point: add(add(scale(f[from], 1 - k), scale(f[to], k)), offset),
  joints: [
    [from, 1 - k],
    [to, k],
  ],
});

/** Where the chest sits on the hip -> neck line (34 cm up a ~50 cm spine on the mannequin). */
const CHEST_ON_SPINE = 0.68;
const WRIST_CM = 7;
const FINGERS_CM = 8;
const TOES_CM = 15;

export function bodyCapsules(f: FighterPoseV1_11): Capsule[] {
  const { up, fwd, left } = bodyFrame(f);
  const side = (cm: number, upCm = 0) => add(scale(left, cm), scale(up, upCm));
  const capsules: Capsule[] = [];
  const core = [f.hip, between(f, 'hip', 'neck', CHEST_ON_SPINE).point] as const;
  for (const sign of [1, -1]) {
    capsules.push({
      part: 'torso',
      a: at(f, 'hip', side(4 * sign)),
      b: between(f, 'hip', 'neck', CHEST_ON_SPINE, side(5.5 * sign)),
      radius: 12,
      core,
    });
  }
  capsules.push(
    {
      part: 'chest',
      a: between(f, 'hip', 'neck', CHEST_ON_SPINE),
      b: at(f, 'neck', side(0, -3)),
      radius: 10,
    },
    {
      part: 'shoulders',
      a: at(f, 'neck', side(17, -5)),
      b: at(f, 'neck', side(-17, -5)),
      radius: 7,
    },
    { part: 'neck', a: at(f, 'neck'), b: between(f, 'neck', 'head', 0.4), radius: 6 },
    { part: 'head', a: at(f, 'head'), b: at(f, 'head'), radius: HEAD_RADIUS_CM },
  );
  for (const [s, sign] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const elbow = `elbow${s}` as const;
    const hand = `hand${s}` as const;
    const knee = `knee${s}` as const;
    const foot = `foot${s}` as const;
    const forearm = Math.max(distance(f[elbow], f[hand]), WRIST_CM + 1);
    const shin = unit(sub(f[foot], f[knee]));
    const footDir = unit(sub(fwd, scale(shin, dot(fwd, shin))), fwd);
    const fingers = scale(unit(sub(f[hand], f[elbow])), FINGERS_CM);
    capsules.push(
      { part: `upperArm${s}`, a: at(f, 'neck', side(17 * sign, -5)), b: at(f, elbow), radius: 5.2 },
      {
        part: `forearm${s}`,
        a: at(f, elbow),
        b: between(f, elbow, hand, 1 - WRIST_CM / forearm),
        radius: 4.2,
      },
      {
        part: `hand${s}`,
        a: between(f, elbow, hand, 1 - WRIST_CM / forearm),
        b: at(f, hand, fingers),
        radius: 3.5,
      },
      { part: `thigh${s}`, a: at(f, 'hip', side(9 * sign, -5)), b: at(f, knee), radius: 7.5 },
      { part: `shin${s}`, a: at(f, knee), b: at(f, foot), radius: 5 },
      { part: `foot${s}`, a: at(f, foot), b: at(f, foot, scale(footDir, TOES_CM)), radius: 3.5 },
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
