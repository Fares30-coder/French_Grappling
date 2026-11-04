import {
  boneLengths,
  type CameraHint,
  CURRENT_JOINTS,
  CURRENT_SKELETON,
  type CurrentFighterPose,
  type CurrentPose,
  clampVec3,
  STANDARD_BODY_V2_21,
  type StandardBoneKey,
  type Vec3,
} from '@tatamap/shared';
import { twoBoneIk } from './ik';
import { add, cross, distance, dot, length, scale, sub, unit } from './vec';

/** The standard bones of the skeleton (CURRENT_BONES, neck -> shoulder aside) plus neck -> head. */
export type FighterLengths = Record<Exclude<StandardBoneKey, 'neck-head'>, number> & {
  neckHead: number;
};

/**
 * The standard body (about 1.75 m, left = right) as FighterLengths: the recommended default for
 * `buildFighter`, so every fighter of a technique shares the same realistic proportions.
 */
export const STANDARD_LENGTHS: Readonly<FighterLengths> = (() => {
  const { 'neck-head': neckHead, ...bones } = STANDARD_BODY_V2_21;
  return { ...bones, neckHead };
})();

/** Where the shoulders and hip joints sit on the torso (same as upgradePose, before any shrug). */
const SHOULDER_SIDE_CM = 17;
const SHOULDER_DROP_CM = 5;
const HIP_SIDE_CM = 9;
const HIP_DROP_CM = 5;
const NOSE_CM = 11;

export type Limb = {
  /** Where the hand (its middle) or the foot (the ankle) should be. */
  target: Vec3;
  /** Direction the elbow or knee bends toward (not a position). */
  pole: Vec3;
  /**
   * Hand: direction of the fingers (default: along the forearm). Foot: direction of the toes
   * (default: like the kneecap, square to the shin).
   */
  tip?: Vec3;
};

export type FighterSpec = {
  pelvis: Vec3;
  /** Direction pelvis -> neck (need not be normalised). */
  torsoDir: Vec3;
  /** Direction neck -> head. */
  headDir: Vec3;
  /** Where the chest faces. Default: where the thighs point (as upgradePose does). */
  facing?: Vec3;
  hands: { L: Limb; R: Limb };
  feet: { L: Limb; R: Limb };
};

/** Lengths of a fighter, to reuse as the reference when building other poses. */
export function boneLengthsOf(fighter: CurrentFighterPose): FighterLengths {
  const { 'neck-shoulderL': _l, 'neck-shoulderR': _r, ...bones } = boneLengths(fighter);
  return { ...bones, neckHead: distance(fighter.neck, fighter.head) };
}

const round1 = (v: Vec3): Vec3 => [
  Math.round(v[0] * 10) / 10,
  Math.round(v[1] * 10) / 10,
  Math.round(v[2] * 10) / 10,
];

/**
 * The foot direction, tilted up just enough for the tip of the foot to rest on the mat instead of
 * going through it (as upgradePose does). Same length.
 */
function onTheMat(foot: Vec3, dir: Vec3, toeCm: number, forward: Vec3): Vec3 {
  if (foot[1] + dir[1] * toeCm >= 0) return dir;
  const y = Math.max(-1, -foot[1] / toeCm);
  let flat: Vec3 = [dir[0], 0, dir[2]];
  if (length(flat) < 1e-6) flat = [forward[0], 0, forward[2]];
  return add(scale(unit(flat, [1, 0, 0]), Math.sqrt(1 - y * y)), [0, y, 0]);
}

/** The part of `a` square to the unit vector `axis`. */
const reject = (a: Vec3, axis: Vec3): Vec3 => sub(a, scale(axis, dot(a, axis)));

/**
 * Builds a fighter from a spec with the bone lengths of `lengths`: torso and head by direction,
 * shoulders and hip joints on the torso, arms (from the shoulder) and legs (from the hip joint)
 * by 2-bone IK, fingertips, toes and nose pointed. Coordinates are rounded to 0.1 cm and clamped
 * into the pose bounds. A limb that cannot reach its target stops short of it, lengths stay exact.
 */
export function buildFighter(lengths: FighterLengths, spec: FighterSpec): CurrentFighterPose {
  const { pelvis, hands, feet } = spec;
  // Per-side keys (TypeScript sees every L/R pairing in a template literal).
  const len = (bone: string): number => lengths[bone as keyof FighterLengths];
  const up = unit(spec.torsoDir);
  const spine = lengths['pelvis-chest'] + lengths['chest-neck'];
  const chest = add(pelvis, scale(up, lengths['pelvis-chest']));
  const neck = add(pelvis, scale(up, spine));
  const head = add(neck, scale(unit(spec.headDir), lengths.neckHead));

  // Facing: given, or from where the knees go (a first IK from the pelvis), like upgradePose.
  let facing = spec.facing ? reject(spec.facing, up) : null;
  if (!facing || length(facing) < 1e-6) {
    const knee = (s: 'L' | 'R') =>
      twoBoneIk(
        pelvis,
        feet[s].target,
        len(`hip${s}-knee${s}`),
        len(`knee${s}-foot${s}`),
        feet[s].pole,
      ).mid;
    const thighs = sub(add(knee('L'), knee('R')), scale(pelvis, 2));
    facing = reject(thighs, up);
    if (length(facing) < 3) facing = reject([1, 0, 0], up);
  }
  const forward = unit(facing, [1, 0, 0]);
  const left = unit(cross(up, forward), [0, 0, -1]);

  const side = (s: 'L' | 'R') => {
    const sign = s === 'L' ? 1 : -1;
    const shoulder = sub(
      add(neck, scale(left, SHOULDER_SIDE_CM * sign)),
      scale(up, SHOULDER_DROP_CM),
    );
    const hip = sub(add(pelvis, scale(left, HIP_SIDE_CM * sign)), scale(up, HIP_DROP_CM));
    const arm = twoBoneIk(
      shoulder,
      hands[s].target,
      len(`shoulder${s}-elbow${s}`),
      len(`elbow${s}-hand${s}`),
      hands[s].pole,
    );
    const leg = twoBoneIk(
      hip,
      feet[s].target,
      len(`hip${s}-knee${s}`),
      len(`knee${s}-foot${s}`),
      feet[s].pole,
    );
    const fingers = unit(hands[s].tip ?? sub(arm.end, arm.mid));
    const shin = unit(sub(leg.end, leg.mid));
    const kneecap = reject(feet[s].pole, shin);
    const toes = onTheMat(
      leg.end,
      unit(feet[s].tip ?? (length(kneecap) > 1e-6 ? kneecap : reject(forward, shin))),
      len(`foot${s}-toe${s}`),
      forward,
    );
    return {
      shoulder,
      hip,
      arm,
      leg,
      handTip: add(arm.end, scale(fingers, len(`hand${s}-handTip${s}`))),
      toe: add(leg.end, scale(toes, len(`foot${s}-toe${s}`))),
    };
  };
  const l = side('L');
  const r = side('R');
  const headAxis = unit(sub(head, neck));
  const face = unit(reject(forward, headAxis), forward);
  const fix = (v: Vec3): Vec3 => clampVec3(round1(v));
  return {
    head: fix(head),
    nose: fix(add(head, scale(face, NOSE_CM))),
    neck: fix(neck),
    chest: fix(chest),
    pelvis: fix(pelvis),
    shoulderL: fix(l.shoulder),
    shoulderR: fix(r.shoulder),
    elbowL: fix(l.arm.mid),
    elbowR: fix(r.arm.mid),
    handL: fix(l.arm.end),
    handR: fix(r.arm.end),
    handTipL: fix(l.handTip),
    handTipR: fix(r.handTip),
    hipL: fix(l.hip),
    hipR: fix(r.hip),
    kneeL: fix(l.leg.mid),
    kneeR: fix(r.leg.mid),
    footL: fix(l.leg.end),
    footR: fix(r.leg.end),
    toeL: fix(l.toe),
    toeR: fix(r.toe),
  };
}

const mapJoints = (fighter: CurrentFighterPose, fn: (p: Vec3) => Vec3): CurrentFighterPose => {
  const out = {} as CurrentFighterPose;
  for (const joint of CURRENT_JOINTS) out[joint] = fn(fighter[joint]);
  return out;
};

/** Moves every joint by `delta` (cm). */
export function translateFighter(fighter: CurrentFighterPose, delta: Vec3): CurrentFighterPose {
  return mapJoints(fighter, (p) => clampVec3(round1(add(p, delta))));
}

export type Axis = 'x' | 'y' | 'z';

/**
 * Rotates a fighter by `deg` around a world axis through the origin (right-hand rule), then
 * optionally lifts or lowers it so its lowest joint sits at `yMin` (e.g. 6 to rest on the mat).
 * Rounded to 0.1 cm. Bone lengths are preserved up to that rounding.
 */
export function rotateFighter(
  fighter: CurrentFighterPose,
  axis: Axis,
  deg: number,
  yMin?: number,
): CurrentFighterPose {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  const rotate = ([x, y, z]: Vec3): Vec3 => {
    switch (axis) {
      case 'x':
        return [x, y * c - z * s, y * s + z * c];
      case 'y':
        return [x * c + z * s, y, -x * s + z * c];
      case 'z':
        return [x * c - y * s, x * s + y * c, z];
    }
  };
  const rotated = mapJoints(fighter, rotate);
  const lift =
    yMin === undefined ? 0 : yMin - Math.min(...CURRENT_JOINTS.map((j) => rotated[j][1]));
  return mapJoints(rotated, ([x, y, z]) => clampVec3(round1([x, y + lift, z])));
}

export const rotateFighterX = (f: CurrentFighterPose, deg: number, yMin?: number) =>
  rotateFighter(f, 'x', deg, yMin);
export const rotateFighterY = (f: CurrentFighterPose, deg: number, yMin?: number) =>
  rotateFighter(f, 'y', deg, yMin);
export const rotateFighterZ = (f: CurrentFighterPose, deg: number, yMin?: number) =>
  rotateFighter(f, 'z', deg, yMin);

/** Assembles a pose document from the two fighters (and an optional suggested camera). */
export function makePose(
  me: CurrentFighterPose,
  opponent: CurrentFighterPose,
  camera?: CameraHint,
): CurrentPose {
  return { skeleton: CURRENT_SKELETON, fighters: { me, opponent }, ...(camera ? { camera } : {}) };
}
