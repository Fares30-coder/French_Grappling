import { type BoneKey, boneLengths } from './edit';
import type { CurrentFighterPose, CurrentPose } from './pose';
import { FIGHTERS, type FighterId } from './skeleton-v1-11';
import { distance } from './vec';

/**
 * A bone of the standard body: the drawn bones (CURRENT_BONES) whose length is fixed in a real
 * body, plus the neck -> head distance. Neck -> shoulder is left out: the shoulder moves with the
 * shoulder blade (up to ~10 cm), so its distance to the neck is not a fixed length.
 */
export type StandardBoneKey = Exclude<BoneKey, 'neck-shoulderL' | 'neck-shoulderR'> | 'neck-head';

export type StandardBody = Record<StandardBoneKey, number>;

/**
 * Target bone lengths (cm) shared by both fighters, left = right: an adult of about 1.75 m.
 *
 * Basis: Drillis & Contini style segment ratios for a 175 cm adult (thigh ~0.245 H = 43 cm,
 * shank ~0.246 H = 43 cm from knee to ankle, upper arm ~0.186 H = 32 cm, forearm ~0.146 H =
 * 25 cm plus ~8 cm to the middle of the hand), with the geometry of skeleton v2-21 in mind:
 * - `pelvis` is the pelvis centre, `chest` sits 34 cm up a 50 cm spine, `neck` is C7, about
 *   22 cm below the head centre; the head is a sphere of radius 13 cm;
 * - shoulder -> elbow is 27 to 34 cm (the shoulder moves like a shoulder blade): 30.5;
 * - `handL/R` is the middle of the hand, `handTip` the fingertips 8 cm further;
 * - hip joints sit 9 cm sideways and 5 cm below the pelvis centre (hypot = 10.3 cm), so hip ->
 *   knee runs from ~39 cm (standing) to ~44 cm (knee up, sitting): 41.5;
 * - `footL/R` is the ankle (~8 cm above the mat), `toe` the tip of the foot 15 cm in front.
 * Standing height: 8 (ankle) + 42 + 38 (hip joint to knee, standing) + 5 + 50 + 22 + 13 = 178 cm.
 */
export const STANDARD_BODY_V2_21: Readonly<StandardBody> = {
  'neck-head': 22,
  'pelvis-chest': 34,
  'chest-neck': 16,
  'shoulderL-elbowL': 30.5,
  'shoulderR-elbowR': 30.5,
  'elbowL-handL': 33,
  'elbowR-handR': 33,
  'handL-handTipL': 8,
  'handR-handTipR': 8,
  'pelvis-hipL': 10.3,
  'pelvis-hipR': 10.3,
  'hipL-kneeL': 41.5,
  'hipR-kneeR': 41.5,
  'kneeL-footL': 42,
  'kneeR-footR': 42,
  'footL-toeL': 15,
  'footR-toeR': 15,
};

export const STANDARD_BODY_TOLERANCE = 0.12;

export type StandardBodyWarning = {
  fighter: FighterId;
  bone: StandardBoneKey;
  lengthCm: number;
  /** The standard length of this bone. */
  referenceCm: number;
};

/** Length of each standard bone of a fighter, neck -> head included. */
export function standardBoneLengths(fighter: CurrentFighterPose): StandardBody {
  const lengths = boneLengths(fighter);
  const body = { 'neck-head': distance(fighter.neck, fighter.head) } as StandardBody;
  for (const bone of Object.keys(STANDARD_BODY_V2_21) as StandardBoneKey[]) {
    if (bone !== 'neck-head') body[bone] = lengths[bone];
  }
  return body;
}

/**
 * Bones of each fighter whose length differs from `STANDARD_BODY_V2_21` by more than `tolerance`
 * (a fraction, 12 % by default). Warnings, never errors (ADR 0002): a stretched limb may be
 * deliberate.
 */
export function standardBodyWarnings(
  pose: CurrentPose,
  tolerance = STANDARD_BODY_TOLERANCE,
): StandardBodyWarning[] {
  const warnings: StandardBodyWarning[] = [];
  const bones = Object.keys(STANDARD_BODY_V2_21) as StandardBoneKey[];
  for (const fighter of FIGHTERS) {
    const lengths = standardBoneLengths(pose.fighters[fighter]);
    for (const bone of bones) {
      const lengthCm = lengths[bone];
      const referenceCm = STANDARD_BODY_V2_21[bone];
      if (Math.abs(lengthCm - referenceCm) / referenceCm > tolerance) {
        warnings.push({ fighter, bone, lengthCm, referenceCm });
      }
    }
  }
  return warnings;
}
