import type { CameraHint } from './pose/skeleton-v1-11';

/** Camera used when a step has no camera hint. */
export const DEFAULT_CAMERA: CameraHint = { position: [170, 170, 300], target: [0, 40, 20] };
/** Default duration of the transition into a step (mirrors Step.transitionMs @default(1300) in Prisma). */
export const DEFAULT_TRANSITION_MS = 1300;
/** How long each step is held during playback. */
export const DEFAULT_HOLD_MS = 1200;
