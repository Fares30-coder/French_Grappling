import { z } from 'zod';
import { poseV1_11Schema } from './skeleton-v1-11';
import {
  BONE_CHAIN_V2_21,
  BONES_V2_21,
  type FighterPoseV2_21,
  fighterPoseV2_21Schema,
  JOINTS_V2_21,
  type JointV2_21,
  MIRRORED_JOINT_V2_21,
  type PoseV2_21,
  poseV2_21Schema,
  SKELETON_V2_21,
} from './skeleton-v2-21';
import { upgradeV1toV2 } from './upgrade-v1-v2';

/** Every skeleton version still readable from storage. */
export const poseSchema = z.discriminatedUnion('skeleton', [poseV1_11Schema, poseV2_21Schema]);
export type Pose = z.infer<typeof poseSchema>;

/** The only version the API returns and the admin accepts on write. */
export const CURRENT_SKELETON = SKELETON_V2_21;
export const currentPoseSchema = poseV2_21Schema;
export type CurrentPose = PoseV2_21;

/**
 * The current skeleton, for code that must not name a version (ADR 0002 D6): joints, drawn
 * bones, interpolation chain (root first), left/right counterparts, one fighter's schema.
 */
export const CURRENT_JOINTS = JOINTS_V2_21;
export type CurrentJoint = JointV2_21;
export type CurrentFighterPose = FighterPoseV2_21;
export const CURRENT_BONES = BONES_V2_21;
export const CURRENT_BONE_CHAIN = BONE_CHAIN_V2_21;
export const CURRENT_ROOT_JOINT: CurrentJoint = 'pelvis';
export const CURRENT_MIRRORED_JOINT = MIRRORED_JOINT_V2_21;
export const currentFighterPoseSchema = fighterPoseV2_21Schema;

/** Upgrades any stored pose to the current skeleton, version by version. Pure, no I/O. */
export function upgradePose(pose: Pose): CurrentPose {
  switch (pose.skeleton) {
    case 'v1-11':
      return upgradeV1toV2(pose);
    case 'v2-21':
      return pose;
  }
}
