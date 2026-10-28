import { z } from 'zod';
import { type PoseV1_11, poseV1_11Schema, SKELETON_V1_11 } from './skeleton-v1-11';

/** Every skeleton version still readable from storage. */
export const poseSchema = z.discriminatedUnion('skeleton', [poseV1_11Schema]);
export type Pose = z.infer<typeof poseSchema>;

/** The only version the API returns and the admin accepts on write. */
export const CURRENT_SKELETON = SKELETON_V1_11;
export const currentPoseSchema = poseV1_11Schema;
export type CurrentPose = PoseV1_11;

/** Upgrades any stored pose to the current skeleton. Pure, no I/O. */
export function upgradePose(pose: Pose): CurrentPose {
  switch (pose.skeleton) {
    case 'v1-11':
      return pose;
    // future: case 'v1-11' -> v2_xx(pose), chained version by version
  }
}
