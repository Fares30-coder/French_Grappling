import { type BoneKey, boneLengths } from './edit';
import type { CurrentPose } from './pose';
import {
  BONES_V1_11,
  FIGHTERS,
  type FighterId,
  type FighterPoseV1_11,
  type Vec3,
} from './skeleton-v1-11';

/** A bone of the standard body: the 9 cylinder bones plus the neck -> head distance. */
export type StandardBoneKey =
  | 'neck-hip'
  | 'neck-elbowL'
  | 'elbowL-handL'
  | 'neck-elbowR'
  | 'elbowR-handR'
  | 'hip-kneeL'
  | 'kneeL-footL'
  | 'hip-kneeR'
  | 'kneeR-footR'
  | 'neck-head';

export type StandardBody = Record<StandardBoneKey, number>;

/**
 * Target bone lengths (cm) shared by both fighters, left = right: an adult of about 1.75 m.
 *
 * Basis: Drillis & Contini style segment ratios for a 175 cm adult (thigh ~0.245 H = 43 cm,
 * shank ~0.246 H = 43 cm from knee to ankle, upper arm ~0.186 H = 32 cm, forearm ~0.146 H =
 * 25 cm plus ~8 cm to the middle of the hand), with the geometry of skeleton v1-11 in mind:
 * - `neck` doubles as the shoulder point, so neck -> elbow is the upper arm (32 cm) plus the
 *   shoulder offset (~18 cm sideways): hypot(32, 14) ~ 35 cm once the shoulder drop is counted;
 * - `hip` is the pelvis centre, `footL/R` the ankle (with the foot, ~8 cm above the mat) and
 *   `handL/R` the middle of the hand;
 * - `neck` is C7, about 22 cm below the head centre; the head is a sphere of radius 13 cm.
 * Standing height: 8 (ankle) + 42 + 43 + 50 + 22 + 13 (head radius) = 178 cm.
 */
export const STANDARD_BODY_V1_11: Readonly<StandardBody> = {
  'neck-head': 22,
  'neck-hip': 50,
  'neck-elbowL': 35,
  'neck-elbowR': 35,
  'elbowL-handL': 33,
  'elbowR-handR': 33,
  'hip-kneeL': 43,
  'hip-kneeR': 43,
  'kneeL-footL': 42,
  'kneeR-footR': 42,
};

export const STANDARD_BODY_TOLERANCE = 0.12;

export type StandardBodyWarning = {
  fighter: FighterId;
  bone: StandardBoneKey;
  lengthCm: number;
  /** The standard length of this bone. */
  referenceCm: number;
};

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Length of each bone of a fighter, neck -> head included. */
export function standardBoneLengths(fighter: FighterPoseV1_11): StandardBody {
  const lengths = boneLengths(fighter);
  const body = { 'neck-head': distance(fighter.neck, fighter.head) } as StandardBody;
  for (const [from, to] of BONES_V1_11) {
    const bone = `${from}-${to}` as BoneKey & StandardBoneKey;
    body[bone] = lengths[bone];
  }
  return body;
}

/**
 * Bones of each fighter whose length differs from `STANDARD_BODY_V1_11` by more than `tolerance`
 * (a fraction, 12 % by default). Warnings, never errors (ADR 0002): a stretched limb may be
 * deliberate.
 */
export function standardBodyWarnings(
  pose: CurrentPose,
  tolerance = STANDARD_BODY_TOLERANCE,
): StandardBodyWarning[] {
  const warnings: StandardBodyWarning[] = [];
  const bones = Object.keys(STANDARD_BODY_V1_11) as StandardBoneKey[];
  for (const fighter of FIGHTERS) {
    const lengths = standardBoneLengths(pose.fighters[fighter]);
    for (const bone of bones) {
      const lengthCm = lengths[bone];
      const referenceCm = STANDARD_BODY_V1_11[bone];
      if (Math.abs(lengthCm - referenceCm) / referenceCm > tolerance) {
        warnings.push({ fighter, bone, lengthCm, referenceCm });
      }
    }
  }
  return warnings;
}
