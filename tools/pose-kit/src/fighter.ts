import {
  boneLengths,
  type CameraHint,
  type CurrentPose,
  clampVec3,
  type FighterPoseV1_11,
  JOINTS_V1_11,
  SKELETON_V1_11,
  STANDARD_BODY_V1_11,
  type StandardBoneKey,
  type Vec3,
} from '@tatamap/shared';
import { twoBoneIk } from './ik';
import { add, distance, scale, unit } from './vec';

/** The 9 cylinder bones of the skeleton plus the neck -> head distance (the head is a sphere). */
export type FighterLengths = Record<Exclude<StandardBoneKey, 'neck-head'>, number> & {
  neckHead: number;
};

/**
 * The standard body (about 1.75 m, left = right) as FighterLengths: the recommended default for
 * `buildFighter`, so every fighter of a technique shares the same realistic proportions.
 */
export const STANDARD_LENGTHS: Readonly<FighterLengths> = {
  'neck-hip': STANDARD_BODY_V1_11['neck-hip'],
  'neck-elbowL': STANDARD_BODY_V1_11['neck-elbowL'],
  'elbowL-handL': STANDARD_BODY_V1_11['elbowL-handL'],
  'neck-elbowR': STANDARD_BODY_V1_11['neck-elbowR'],
  'elbowR-handR': STANDARD_BODY_V1_11['elbowR-handR'],
  'hip-kneeL': STANDARD_BODY_V1_11['hip-kneeL'],
  'kneeL-footL': STANDARD_BODY_V1_11['kneeL-footL'],
  'hip-kneeR': STANDARD_BODY_V1_11['hip-kneeR'],
  'kneeR-footR': STANDARD_BODY_V1_11['kneeR-footR'],
  neckHead: STANDARD_BODY_V1_11['neck-head'],
};

export type Limb = {
  /** Where the hand or foot should be. */
  target: Vec3;
  /** Direction the elbow or knee bends toward (not a position). */
  pole: Vec3;
};

export type FighterSpec = {
  hip: Vec3;
  /** Direction hip -> neck (need not be normalised). */
  torsoDir: Vec3;
  /** Direction neck -> head. */
  headDir: Vec3;
  hands: { L: Limb; R: Limb };
  feet: { L: Limb; R: Limb };
};

/** Lengths of a fighter, to reuse as the reference when building other poses. */
export function boneLengthsOf(fighter: FighterPoseV1_11): FighterLengths {
  return { ...boneLengths(fighter), neckHead: distance(fighter.neck, fighter.head) };
}

const round1 = (v: Vec3): Vec3 => [
  Math.round(v[0] * 10) / 10,
  Math.round(v[1] * 10) / 10,
  Math.round(v[2] * 10) / 10,
];

/**
 * Builds a fighter from a spec with the bone lengths of `lengths`: torso and head by direction,
 * arms and legs by 2-bone IK. Coordinates are rounded to 0.1 cm and clamped into the pose
 * bounds. A limb that cannot reach its target stops short of it, lengths stay exact.
 */
export function buildFighter(lengths: FighterLengths, spec: FighterSpec): FighterPoseV1_11 {
  const { hip } = spec;
  const neck = add(hip, scale(unit(spec.torsoDir), lengths['neck-hip']));
  const head = add(neck, scale(unit(spec.headDir), lengths.neckHead));
  const { hands, feet } = spec;
  const armL = twoBoneIk(
    neck,
    hands.L.target,
    lengths['neck-elbowL'],
    lengths['elbowL-handL'],
    hands.L.pole,
  );
  const armR = twoBoneIk(
    neck,
    hands.R.target,
    lengths['neck-elbowR'],
    lengths['elbowR-handR'],
    hands.R.pole,
  );
  const legL = twoBoneIk(
    hip,
    feet.L.target,
    lengths['hip-kneeL'],
    lengths['kneeL-footL'],
    feet.L.pole,
  );
  const legR = twoBoneIk(
    hip,
    feet.R.target,
    lengths['hip-kneeR'],
    lengths['kneeR-footR'],
    feet.R.pole,
  );
  const fix = (v: Vec3): Vec3 => clampVec3(round1(v));
  return {
    head: fix(head),
    neck: fix(neck),
    hip: fix(hip),
    elbowL: fix(armL.mid),
    handL: fix(armL.end),
    elbowR: fix(armR.mid),
    handR: fix(armR.end),
    kneeL: fix(legL.mid),
    footL: fix(legL.end),
    kneeR: fix(legR.mid),
    footR: fix(legR.end),
  };
}

const mapJoints = (fighter: FighterPoseV1_11, fn: (p: Vec3) => Vec3): FighterPoseV1_11 => {
  const out = {} as FighterPoseV1_11;
  for (const joint of JOINTS_V1_11) out[joint] = fn(fighter[joint]);
  return out;
};

/** Moves every joint by `delta` (cm). */
export function translateFighter(fighter: FighterPoseV1_11, delta: Vec3): FighterPoseV1_11 {
  return mapJoints(fighter, (p) => clampVec3(round1(add(p, delta))));
}

export type Axis = 'x' | 'y' | 'z';

/**
 * Rotates a fighter by `deg` around a world axis through the origin (right-hand rule), then
 * optionally lifts or lowers it so its lowest joint sits at `yMin` (e.g. 6 to rest on the mat).
 * Rounded to 0.1 cm. Bone lengths are preserved up to that rounding.
 */
export function rotateFighter(
  fighter: FighterPoseV1_11,
  axis: Axis,
  deg: number,
  yMin?: number,
): FighterPoseV1_11 {
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
  const lift = yMin === undefined ? 0 : yMin - Math.min(...JOINTS_V1_11.map((j) => rotated[j][1]));
  return mapJoints(rotated, ([x, y, z]) => clampVec3(round1([x, y + lift, z])));
}

export const rotateFighterX = (f: FighterPoseV1_11, deg: number, yMin?: number) =>
  rotateFighter(f, 'x', deg, yMin);
export const rotateFighterY = (f: FighterPoseV1_11, deg: number, yMin?: number) =>
  rotateFighter(f, 'y', deg, yMin);
export const rotateFighterZ = (f: FighterPoseV1_11, deg: number, yMin?: number) =>
  rotateFighter(f, 'z', deg, yMin);

/** Assembles a pose document from the two fighters (and an optional suggested camera). */
export function makePose(
  me: FighterPoseV1_11,
  opponent: FighterPoseV1_11,
  camera?: CameraHint,
): CurrentPose {
  return { skeleton: SKELETON_V1_11, fighters: { me, opponent }, ...(camera ? { camera } : {}) };
}
