import { z } from 'zod';

export const SKELETON_V1_11 = 'v1-11';

export const JOINTS_V1_11 = [
  'head',
  'neck',
  'hip',
  'elbowL',
  'handL',
  'elbowR',
  'handR',
  'kneeL',
  'footL',
  'kneeR',
  'footR',
] as const;
export type JointV1_11 = (typeof JOINTS_V1_11)[number];

/** Segments drawn as cylinders. The head is a sphere only (radius HEAD_RADIUS_CM). */
export const BONES_V1_11 = [
  ['neck', 'hip'],
  ['neck', 'elbowL'],
  ['elbowL', 'handL'],
  ['neck', 'elbowR'],
  ['elbowR', 'handR'],
  ['hip', 'kneeL'],
  ['kneeL', 'footL'],
  ['hip', 'kneeR'],
  ['kneeR', 'footR'],
] as const satisfies ReadonlyArray<readonly [JointV1_11, JointV1_11]>;

export const HEAD_RADIUS_CM = 13;

export const FIGHTERS = ['me', 'opponent'] as const;
export type FighterId = (typeof FIGHTERS)[number];
export const FIGHTER_COLORS: Record<FighterId, string> = { me: '#1D9E75', opponent: '#D85A30' };

export const POSE_BOUNDS_CM = {
  x: { min: -400, max: 400 },
  y: { min: 0, max: 260 },
  z: { min: -400, max: 400 },
} as const;

// z.number() rejects NaN and ±Infinity in Zod 4.
const coord = (b: { min: number; max: number }) => z.number().min(b.min).max(b.max);

export const jointPositionSchema = z.tuple([
  coord(POSE_BOUNDS_CM.x),
  coord(POSE_BOUNDS_CM.y),
  coord(POSE_BOUNDS_CM.z),
]);
export type Vec3 = z.infer<typeof jointPositionSchema>;

// Explicit keys (not built from JOINTS_V1_11) to keep precise inferred types.
// A unit test asserts Object.keys(shape) equals JOINTS_V1_11.
export const fighterPoseV1_11Schema = z.strictObject({
  head: jointPositionSchema,
  neck: jointPositionSchema,
  hip: jointPositionSchema,
  elbowL: jointPositionSchema,
  handL: jointPositionSchema,
  elbowR: jointPositionSchema,
  handR: jointPositionSchema,
  kneeL: jointPositionSchema,
  footL: jointPositionSchema,
  kneeR: jointPositionSchema,
  footR: jointPositionSchema,
});
export type FighterPoseV1_11 = z.infer<typeof fighterPoseV1_11Schema>;

const camCoord = z.number().min(-2000).max(2000);
export const cameraSchema = z.strictObject({
  position: z.tuple([camCoord, z.number().min(0).max(2000), camCoord]),
  target: z.tuple([camCoord, camCoord, camCoord]),
});
export type CameraHint = z.infer<typeof cameraSchema>;

/**
 * What a hand does, which joint positions alone cannot tell: holding (a fist on a collar, a
 * sleeve, a wrist), pushing or posted (flat), or free (relaxed). A hand left out is "auto": the
 * renderer decides from the distance to the other body. Optional, so no skeleton version bump.
 */
export const HAND_STATES = ['grip', 'push', 'free'] as const;
export const handStateSchema = z.enum(HAND_STATES);
export type HandState = z.infer<typeof handStateSchema>;
export const HAND_STATE_LABELS_FR: Record<HandState, string> = {
  grip: 'Tient',
  push: 'Pousse',
  free: 'Libre',
};

export const HAND_SIDES = ['L', 'R'] as const;
export type HandSide = (typeof HAND_SIDES)[number];

const fighterHandsSchema = z.strictObject({
  L: handStateSchema.optional(),
  R: handStateSchema.optional(),
});
export const handsSchema = z.strictObject({
  me: fighterHandsSchema.optional(),
  opponent: fighterHandsSchema.optional(),
});
export type Hands = z.infer<typeof handsSchema>;

export const poseV1_11Schema = z.strictObject({
  skeleton: z.literal(SKELETON_V1_11),
  fighters: z.strictObject({
    me: fighterPoseV1_11Schema,
    opponent: fighterPoseV1_11Schema,
  }),
  camera: cameraSchema.optional(),
  hands: handsSchema.optional(),
});
export type PoseV1_11 = z.infer<typeof poseV1_11Schema>;
