import { type CameraHint, DEFAULT_CAMERA } from '@tatamap/shared';

/** 'step': perspective, camera hint of the step (or DEFAULT_CAMERA).
 *  'front' | 'side' | 'top': orthographic axis views (looking along -z, -x, -y) centred on the target. */
export type ViewPreset = 'step' | 'front' | 'side' | 'top';

export type Vec3 = readonly [number, number, number];

export type CameraFrame = {
  projection: 'perspective' | 'orthographic';
  position: Vec3;
  target: Vec3;
  up: Vec3;
  /** Orthographic only: pixels per cm. */
  zoom?: number;
};

/** Distance from the target in the orthographic views (they have no perspective, so any value works). */
const ORTHO_DISTANCE_CM = 600;
/** Width of the scene (cm) visible across the viewport in the orthographic views. */
export const ORTHO_VIEW_WIDTH_CM = 300;

const UP_Y: Vec3 = [0, 1, 0];

/** Pure camera framing for a view preset. `widthPx` is the viewport width in pixels. */
export function frameCamera(
  view: ViewPreset,
  hint: CameraHint | undefined,
  widthPx: number,
): CameraFrame {
  const { position, target } = hint ?? DEFAULT_CAMERA;
  if (view === 'step') {
    return { projection: 'perspective', position, target, up: UP_Y };
  }
  const [tx, ty, tz] = target;
  const zoom = Math.max(widthPx, 1) / ORTHO_VIEW_WIDTH_CM;
  switch (view) {
    case 'front': // looks along -z
      return {
        projection: 'orthographic',
        position: [tx, ty, tz + ORTHO_DISTANCE_CM],
        target,
        up: UP_Y,
        zoom,
      };
    case 'side': // looks along -x
      return {
        projection: 'orthographic',
        position: [tx + ORTHO_DISTANCE_CM, ty, tz],
        target,
        up: UP_Y,
        zoom,
      };
    case 'top': // looks along -y; "up" on screen is -z so it is not collinear with the view direction
      return {
        projection: 'orthographic',
        position: [tx, ty + ORTHO_DISTANCE_CM, tz],
        target,
        up: [0, 0, -1],
        zoom,
      };
  }
}
