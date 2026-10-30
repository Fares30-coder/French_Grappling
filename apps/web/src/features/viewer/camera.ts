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

/** Aspect ratio the step cameras are placed for (the editor's 16:9 viewer). */
export const REFERENCE_ASPECT = 16 / 9;

/**
 * Pulls a perspective camera back along its line of sight, keeping its target: by `margin`
 * (> 1 leaves room around the fighters, e.g. thumbnails) and further on viewports narrower than
 * the reference, so the same width of scene stays visible (the field of view is vertical).
 */
export function fitStepCamera(position: Vec3, target: Vec3, aspect: number, margin = 1): Vec3 {
  const factor = margin * Math.max(1, REFERENCE_ASPECT / Math.max(aspect, 0.1));
  return [
    target[0] + (position[0] - target[0]) * factor,
    target[1] + (position[1] - target[1]) * factor,
    target[2] + (position[2] - target[2]) * factor,
  ];
}
