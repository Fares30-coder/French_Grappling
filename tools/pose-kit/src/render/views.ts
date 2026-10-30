import type { CameraHint, CurrentPose } from '@tatamap/shared';
import { poseCenter } from '../analyze';

/**
 * Same vocabulary as the editor's view buttons:
 * - `3d`: perspective, the step's suggested camera (or the default camera)
 * - `face`: orthographic along -z, shows the x/y plane (fighters left to right, the classic side-on grappling picture)
 * - `profil`: orthographic along -x, shows the z/y plane
 * - `dessus`: orthographic from above (screen up = -z)
 */
export const RENDER_VIEWS = ['3d', 'face', 'profil', 'dessus'] as const;
export type RenderView = (typeof RENDER_VIEWS)[number];

/** The ViewPreset of the viewer for each render view. */
export const VIEW_PRESET = {
  '3d': 'step',
  face: 'front',
  profil: 'side',
  dessus: 'top',
} as const satisfies Record<RenderView, 'step' | 'front' | 'side' | 'top'>;

export type ShowRequest = {
  step: number;
  view: (typeof VIEW_PRESET)[RenderView];
  camera?: CameraHint;
  width?: number;
  height?: number;
};

/** The 3D view has the 16:9 of the technique page; axis views are 4:3 (they show 300 cm across, so more height). */
const AXIS_SIZE = { width: 800, height: 600 } as const;

/**
 * Request for the preview page. Axis views are centred on the bounding box of the step's joints
 * (the stored camera hint is made for the 3D view); the 3D view keeps the step's own camera.
 */
export function showRequest(pose: CurrentPose, step: number, view: RenderView): ShowRequest {
  const preset = VIEW_PRESET[view];
  if (preset === 'step') return { step, view: preset };
  const [x, y, z] = poseCenter(pose);
  return {
    step,
    view: preset,
    ...AXIS_SIZE,
    camera: { position: [x, y + 1, z], target: [x, y, z] },
  };
}
