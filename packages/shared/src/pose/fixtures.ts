import type { PoseV1_11 } from './skeleton-v1-11';

// Scissor sweep, step 1 (see CLAUDE.md), already converted to 3D centimetres.
/** Test fixture, not exported from the package index. */
export const validPose: PoseV1_11 = {
  skeleton: 'v1-11',
  fighters: {
    me: {
      head: [-150, 24, 0],
      neck: [-125, 21, 0],
      hip: [-30, 18, 0],
      elbowL: [-85, 56, 16],
      handL: [-10, 91, 16],
      elbowR: [-80, 48, -16],
      handR: [-15, 76, -16],
      kneeL: [20, 56, 16],
      footL: [52, 44, 16],
      kneeR: [15, 50, -16],
      footR: [45, 34, -16],
    },
    opponent: {
      head: [22, 156, 0],
      neck: [25, 131, 0],
      hip: [32, 66, 0],
      elbowL: [2, 96, 16],
      handL: [-22, 48, 16],
      elbowR: [8, 91, -16],
      handR: [-15, 44, -16],
      kneeL: [-10, 11, 16],
      footL: [72, 8, 16],
      kneeR: [-5, 14, -16],
      footR: [76, 10, -16],
    },
  },
  camera: { position: [170, 170, 300], target: [0, 40, 20] },
};

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
