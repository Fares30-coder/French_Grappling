import { DEFAULT_CAMERA } from '../defaults';
import type { CurrentPose } from './pose';
import type { FighterPoseV1_11, Vec3 } from './skeleton-v1-11';

/**
 * `me`, standing and facing +x (his left side is towards -z), centred at x = -50. Bone lengths
 * follow STANDARD_BODY_V1_11.
 */
const me: FighterPoseV1_11 = {
  head: [-50, 165, 0],
  neck: [-50, 143, 0],
  hip: [-50, 93, 0],
  elbowL: [-44, 112.8, -16.6],
  handL: [-15.8, 129.7, -19.4],
  elbowR: [-44, 112.8, 16.6],
  handR: [-15.8, 129.7, 19.4],
  kneeL: [-45.8, 50.5, -5.1],
  footL: [-45.8, 8.6, -7.2],
  kneeR: [-45.8, 50.5, 5.1],
  footR: [-45.8, 8.6, 7.2],
};

/** A half-turn around the y axis, which keeps left and right correct: [x, y, z] -> [-x, y, -z]. */
const turn = ([x, y, z]: Vec3): Vec3 => [0 - x, y, 0 - z];

const opponent: FighterPoseV1_11 = {
  head: turn(me.head),
  neck: turn(me.neck),
  hip: turn(me.hip),
  elbowL: turn(me.elbowL),
  handL: turn(me.handL),
  elbowR: turn(me.elbowR),
  handR: turn(me.handR),
  kneeL: turn(me.kneeL),
  footL: turn(me.footL),
  kneeR: turn(me.kneeR),
  footR: turn(me.footR),
};

/** Two fighters standing face to face; the first step of a new technique. */
export const STARTER_POSE: CurrentPose = {
  skeleton: 'v1-11',
  fighters: { me, opponent },
  camera: { position: [...DEFAULT_CAMERA.position], target: [...DEFAULT_CAMERA.target] },
};
