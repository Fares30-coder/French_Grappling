import {
  CURRENT_BONES,
  CURRENT_JOINTS,
  CURRENT_MIRRORED_JOINT,
  type CurrentFighterPose,
  type CurrentJoint,
  type CurrentPose,
} from './pose';
import {
  type CameraHint,
  FIGHTERS,
  type FighterId,
  type HandSide,
  type HandState,
  type Hands,
  POSE_BOUNDS_CM,
  type Vec3,
} from './skeleton-v1-11';

const flipZ = ([x, y, z]: Vec3): Vec3 => [x, y, 0 - z];

function mirrorFighter(fighter: CurrentFighterPose): CurrentFighterPose {
  // Every joint of CURRENT_JOINTS is set below, so the cast is safe.
  const out = {} as CurrentFighterPose;
  for (const joint of CURRENT_JOINTS) out[joint] = flipZ(fighter[CURRENT_MIRRORED_JOINT[joint]]);
  return out;
}

/**
 * World mirror across the plane z = 0, swapping L/R joints (the technique done on the other side).
 * An involution: mirroring twice gives the original pose back.
 */
export function mirrorPose(pose: CurrentPose): CurrentPose {
  const camera: CameraHint | undefined = pose.camera && {
    position: flipZ(pose.camera.position),
    target: flipZ(pose.camera.target),
  };
  return {
    skeleton: pose.skeleton,
    fighters: {
      me: mirrorFighter(pose.fighters.me),
      opponent: mirrorFighter(pose.fighters.opponent),
    },
    ...(camera ? { camera } : {}),
    ...(pose.hands ? { hands: mirrorHands(pose.hands) } : {}),
  };
}

function mirrorHands(hands: Hands): Hands {
  const mirrored: Hands = {};
  for (const fighter of FIGHTERS) {
    const own = hands[fighter];
    if (!own) continue;
    mirrored[fighter] = {
      ...(own.R ? { L: own.R } : {}),
      ...(own.L ? { R: own.L } : {}),
    };
  }
  return mirrored;
}

/** State of one hand, or undefined when it is left to the renderer ("auto"). */
export function handState(
  pose: CurrentPose,
  fighter: FighterId,
  side: HandSide,
): HandState | undefined {
  return pose.hands?.[fighter]?.[side];
}

/** Sets (or, with undefined, clears) a hand state; drops objects left empty. Pure. */
export function withHandState(
  pose: CurrentPose,
  fighter: FighterId,
  side: HandSide,
  state: HandState | undefined,
): CurrentPose {
  const hands: Hands = { ...pose.hands };
  const own = { ...hands[fighter] };
  if (state) own[side] = state;
  else delete own[side];
  if (Object.keys(own).length) hands[fighter] = own;
  else delete hands[fighter];
  const { hands: _old, ...rest } = pose;
  return Object.keys(hands).length ? { ...rest, hands } : rest;
}

/**
 * Joints carried along when a joint is moved by hand in the editor, by the same offset: the tips
 * that only point a part (fingertips, toes, nose), the hip joints with the pelvis and the
 * shoulders with the neck. Each can still be moved on its own.
 */
export const JOINT_FOLLOWERS: Readonly<Partial<Record<CurrentJoint, ReadonlyArray<CurrentJoint>>>> =
  {
    head: ['nose'],
    neck: ['shoulderL', 'shoulderR'],
    pelvis: ['hipL', 'hipR'],
    handL: ['handTipL'],
    handR: ['handTipR'],
    footL: ['toeL'],
    footR: ['toeR'],
  };

/** `fighter` with `joint` at `position` and its followers moved by the same offset. Pure. */
export function moveJoint(
  fighter: CurrentFighterPose,
  joint: CurrentJoint,
  position: Vec3,
): CurrentFighterPose {
  const target = clampVec3(position);
  const before = fighter[joint];
  const delta: Vec3 = [target[0] - before[0], target[1] - before[1], target[2] - before[2]];
  const out: CurrentFighterPose = { ...fighter, [joint]: target };
  for (const follower of JOINT_FOLLOWERS[joint] ?? []) {
    const p = fighter[follower];
    out[follower] = clampVec3([p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]]);
  }
  return out;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Clamps a joint into POSE_BOUNDS_CM so an edited pose always passes currentPoseSchema. */
export function clampVec3([x, y, z]: Vec3): Vec3 {
  return [
    clamp(x, POSE_BOUNDS_CM.x.min, POSE_BOUNDS_CM.x.max),
    clamp(y, POSE_BOUNDS_CM.y.min, POSE_BOUNDS_CM.y.max),
    clamp(z, POSE_BOUNDS_CM.z.min, POSE_BOUNDS_CM.z.max),
  ];
}

/** "from-to" of one bone; distributes over a union of bones (only the real pairs). */
type BoneKeyOf<B> = B extends readonly [infer F extends string, infer T extends string]
  ? `${F}-${T}`
  : never;
export type BoneKey = BoneKeyOf<(typeof CURRENT_BONES)[number]>;

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Key of a bone of CURRENT_BONES (TypeScript sees every pair of names in a template literal). */
export const boneKey = (from: string, to: string): BoneKey => `${from}-${to}` as BoneKey;

/** Length in cm of each drawn bone of a fighter (CURRENT_BONES). */
export function boneLengths(fighter: CurrentFighterPose): Record<BoneKey, number> {
  const lengths: Partial<Record<BoneKey, number>> = {};
  for (const [from, to] of CURRENT_BONES) {
    lengths[boneKey(from, to)] = distance(fighter[from], fighter[to]);
  }
  return lengths as Record<BoneKey, number>; // every bone of CURRENT_BONES was just filled in
}

export const BONE_LENGTH_TOLERANCE = 0.15;

export type PoseWarning = {
  fighter: FighterId;
  bone: BoneKey;
  lengthCm: number;
  referenceCm: number;
};

/**
 * Bones whose length differs by more than 15 % from the same bone in `reference` (step 1).
 * Warnings, never errors (ADR 0002): a stretched limb may be deliberate.
 */
export function poseWarnings(pose: CurrentPose, reference: CurrentPose): PoseWarning[] {
  const warnings: PoseWarning[] = [];
  for (const fighter of FIGHTERS) {
    const lengths = boneLengths(pose.fighters[fighter]);
    const references = boneLengths(reference.fighters[fighter]);
    for (const [from, to] of CURRENT_BONES) {
      const bone = boneKey(from, to);
      const lengthCm = lengths[bone];
      const referenceCm = references[bone];
      if (
        referenceCm > 0 &&
        Math.abs(lengthCm - referenceCm) / referenceCm > BONE_LENGTH_TOLERANCE
      ) {
        warnings.push({ fighter, bone, lengthCm, referenceCm });
      }
    }
  }
  return warnings;
}
