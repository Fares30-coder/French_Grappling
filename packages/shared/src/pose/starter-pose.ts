import { DEFAULT_CAMERA } from '../defaults';
import type { CurrentPose } from './pose';
import type { FighterPoseV1_11, Vec3 } from './skeleton-v1-11';

/** `me`, standing and facing +x (his left side is towards -z), centred at x = -50. */
const me: FighterPoseV1_11 = {
  head: [-50, 160, 0],
  neck: [-50, 140, 0],
  hip: [-50, 95, 0],
  elbowL: [-40, 110, -20],
  handL: [-15, 128, -15],
  elbowR: [-40, 110, 20],
  handR: [-15, 128, 15],
  kneeL: [-45, 50, -12],
  footL: [-50, 5, -15],
  kneeR: [-45, 50, 12],
  footR: [-50, 5, 15],
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
