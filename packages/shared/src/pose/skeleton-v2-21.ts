import { z } from 'zod';
import { cameraSchema, handsSchema, jointPositionSchema } from './skeleton-v1-11';

export const SKELETON_V2_21 = 'v2-21';

/**
 * 21 joints per fighter (ADR 0004, step 2), still points in cm. Compared with v1-11:
 * - `pelvis` is the v1-11 `hip` (centre of the pelvis); `hipL`/`hipR` are the hip joints;
 * - `chest` (on the spine) and `shoulderL`/`shoulderR` give the torso its bend and twist;
 * - `nose` points the head; `handTipL`/`handTipR` (fingertips) point the hands, `toeL`/`toeR`
 *   (tip of the foot) the feet;
 * - `handL`/`handR` stay the middle of the hand, `footL`/`footR` the ankle, as in v1-11.
 */
export const JOINTS_V2_21 = [
  'head',
  'nose',
  'neck',
  'chest',
  'pelvis',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'handL',
  'handR',
  'handTipL',
  'handTipR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
  'footL',
  'footR',
  'toeL',
  'toeR',
] as const;
export type JointV2_21 = (typeof JOINTS_V2_21)[number];

/** Segments drawn as cylinders. The head is a sphere only (radius HEAD_RADIUS_CM). */
export const BONES_V2_21 = [
  ['pelvis', 'chest'],
  ['chest', 'neck'],
  ['neck', 'shoulderL'],
  ['shoulderL', 'elbowL'],
  ['elbowL', 'handL'],
  ['handL', 'handTipL'],
  ['neck', 'shoulderR'],
  ['shoulderR', 'elbowR'],
  ['elbowR', 'handR'],
  ['handR', 'handTipR'],
  ['pelvis', 'hipL'],
  ['hipL', 'kneeL'],
  ['kneeL', 'footL'],
  ['footL', 'toeL'],
  ['pelvis', 'hipR'],
  ['hipR', 'kneeR'],
  ['kneeR', 'footR'],
  ['footR', 'toeR'],
] as const satisfies ReadonlyArray<readonly [JointV2_21, JointV2_21]>;

/**
 * Bones from the root outwards, each [parent, child], for interpolation: the pelvis is the root.
 * Every joint except the pelvis appears exactly once as a child.
 */
export const BONE_CHAIN_V2_21 = [
  ['pelvis', 'chest'],
  ['chest', 'neck'],
  ['neck', 'head'],
  ['head', 'nose'],
  ['neck', 'shoulderL'],
  ['shoulderL', 'elbowL'],
  ['elbowL', 'handL'],
  ['handL', 'handTipL'],
  ['neck', 'shoulderR'],
  ['shoulderR', 'elbowR'],
  ['elbowR', 'handR'],
  ['handR', 'handTipR'],
  ['pelvis', 'hipL'],
  ['hipL', 'kneeL'],
  ['kneeL', 'footL'],
  ['footL', 'toeL'],
  ['pelvis', 'hipR'],
  ['hipR', 'kneeR'],
  ['kneeR', 'footR'],
  ['footR', 'toeR'],
] as const satisfies ReadonlyArray<readonly [JointV2_21, JointV2_21]>;

/** Left/right counterpart of a joint (the joints on the midline are their own). */
export const MIRRORED_JOINT_V2_21: Readonly<Record<JointV2_21, JointV2_21>> = {
  head: 'head',
  nose: 'nose',
  neck: 'neck',
  chest: 'chest',
  pelvis: 'pelvis',
  shoulderL: 'shoulderR',
  shoulderR: 'shoulderL',
  elbowL: 'elbowR',
  elbowR: 'elbowL',
  handL: 'handR',
  handR: 'handL',
  handTipL: 'handTipR',
  handTipR: 'handTipL',
  hipL: 'hipR',
  hipR: 'hipL',
  kneeL: 'kneeR',
  kneeR: 'kneeL',
  footL: 'footR',
  footR: 'footL',
  toeL: 'toeR',
  toeR: 'toeL',
};

// Explicit keys (not built from JOINTS_V2_21) to keep precise inferred types.
// A unit test asserts Object.keys(shape) equals JOINTS_V2_21.
export const fighterPoseV2_21Schema = z.strictObject({
  head: jointPositionSchema,
  nose: jointPositionSchema,
  neck: jointPositionSchema,
  chest: jointPositionSchema,
  pelvis: jointPositionSchema,
  shoulderL: jointPositionSchema,
  shoulderR: jointPositionSchema,
  elbowL: jointPositionSchema,
  elbowR: jointPositionSchema,
  handL: jointPositionSchema,
  handR: jointPositionSchema,
  handTipL: jointPositionSchema,
  handTipR: jointPositionSchema,
  hipL: jointPositionSchema,
  hipR: jointPositionSchema,
  kneeL: jointPositionSchema,
  kneeR: jointPositionSchema,
  footL: jointPositionSchema,
  footR: jointPositionSchema,
  toeL: jointPositionSchema,
  toeR: jointPositionSchema,
});
export type FighterPoseV2_21 = z.infer<typeof fighterPoseV2_21Schema>;

/**
 * A direction (any length above a millimetre, no unit): where the thumb side of a hand points.
 * Without it the renderer derives the hand's roll from the elbow bend (the forearm never turns),
 * which cannot show a pronated or supinated hand: a palm laid on an arm from the other side.
 */
const directionSchema = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
  .refine(([x, y, z]) => Math.hypot(x, y, z) >= 0.1, 'direction too short');
const fighterThumbsSchema = z.strictObject({
  L: directionSchema.optional(),
  R: directionSchema.optional(),
});
/** Thumb direction of the hands that need one (ADR 0002, addendum 2026-11-09); others are automatic. */
export const thumbsSchema = z.strictObject({
  me: fighterThumbsSchema.optional(),
  opponent: fighterThumbsSchema.optional(),
});
export type Thumbs = z.infer<typeof thumbsSchema>;

export const poseV2_21Schema = z.strictObject({
  skeleton: z.literal(SKELETON_V2_21),
  fighters: z.strictObject({
    me: fighterPoseV2_21Schema,
    opponent: fighterPoseV2_21Schema,
  }),
  camera: cameraSchema.optional(),
  hands: handsSchema.optional(),
  thumbs: thumbsSchema.optional(),
});
export type PoseV2_21 = z.infer<typeof poseV2_21Schema>;
