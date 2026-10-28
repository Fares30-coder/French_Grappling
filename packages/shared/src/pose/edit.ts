import type { CurrentPose } from './pose';
import {
  BONES_V1_11,
  type CameraHint,
  FIGHTERS,
  type FighterId,
  type FighterPoseV1_11,
  type JointV1_11,
  POSE_BOUNDS_CM,
  type Vec3,
} from './skeleton-v1-11';

/** Left/right counterpart of a joint (head, neck and hip are their own). */
const MIRRORED_JOINT: Record<JointV1_11, JointV1_11> = {
  head: 'head',
  neck: 'neck',
  hip: 'hip',
  elbowL: 'elbowR',
  handL: 'handR',
  elbowR: 'elbowL',
  handR: 'handL',
  kneeL: 'kneeR',
  footL: 'footR',
  kneeR: 'kneeL',
  footR: 'footL',
};

const flipZ = ([x, y, z]: Vec3): Vec3 => [x, y, 0 - z];

function mirrorFighter(fighter: FighterPoseV1_11): FighterPoseV1_11 {
  return {
    head: flipZ(fighter[MIRRORED_JOINT.head]),
    neck: flipZ(fighter[MIRRORED_JOINT.neck]),
    hip: flipZ(fighter[MIRRORED_JOINT.hip]),
    elbowL: flipZ(fighter[MIRRORED_JOINT.elbowL]),
    handL: flipZ(fighter[MIRRORED_JOINT.handL]),
    elbowR: flipZ(fighter[MIRRORED_JOINT.elbowR]),
    handR: flipZ(fighter[MIRRORED_JOINT.handR]),
    kneeL: flipZ(fighter[MIRRORED_JOINT.kneeL]),
    footL: flipZ(fighter[MIRRORED_JOINT.footL]),
    kneeR: flipZ(fighter[MIRRORED_JOINT.kneeR]),
    footR: flipZ(fighter[MIRRORED_JOINT.footR]),
  };
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
  };
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

export type BoneKey = `${(typeof BONES_V1_11)[number][0]}-${(typeof BONES_V1_11)[number][1]}`;

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Length in cm of each of the 9 bones of a fighter. */
export function boneLengths(fighter: FighterPoseV1_11): Record<BoneKey, number> {
  const lengths: Partial<Record<BoneKey, number>> = {};
  for (const [from, to] of BONES_V1_11) {
    lengths[`${from}-${to}`] = distance(fighter[from], fighter[to]);
  }
  return lengths as Record<BoneKey, number>; // every bone of BONES_V1_11 was just filled in
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
    for (const [from, to] of BONES_V1_11) {
      const bone: BoneKey = `${from}-${to}`;
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
