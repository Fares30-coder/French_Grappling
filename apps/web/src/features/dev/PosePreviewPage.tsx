import { useFrame, useThree } from '@react-three/fiber';
import { type CameraHint, contentTechniqueSchema } from '@tatamap/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewPreset } from '../viewer/TechniqueScene';
import { TechniqueViewer, type ViewerStep } from '../viewer/TechniqueViewer';

/**
 * DEV ONLY (the route is not registered in production builds). Renders the real TechniqueViewer
 * for a technique that the `pose:render` script injects as `window.__TATAMAP_PREVIEW__`, and
 * exposes `window.__TATAMAP_POSE_PREVIEW__.show()` so a headless browser can request a step / view
 * and wait until the frame is really drawn. No API, no auth, no network.
 */

export type PreviewRequest = {
  step: number;
  view: ViewPreset;
  /** Replaces the step's camera hint (perspective position/target, or the target of axis views). */
  camera?: CameraHint;
  /** Canvas size in CSS pixels (default 960x540, the 16:9 of the technique page). */
  width?: number;
  height?: number;
};

declare global {
  interface Window {
    __TATAMAP_PREVIEW__?: unknown;
    __TATAMAP_POSE_PREVIEW__?: { show: (request: PreviewRequest) => Promise<void> };
  }
}

const DEFAULT_WIDTH_PX = 960;
const DEFAULT_HEIGHT_PX = 540;

/** Resolves once the canvas has drawn a few frames with the camera matching the requested view. */
function ReadySignal({ view, onReady }: { view: ViewPreset; onReady: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const frames = useRef(0);
  const done = useRef(false);
  const expectOrtho = view !== 'step';

  useFrame(() => {
    frames.current += 1;
    const cameraOk = (camera.type === 'OrthographicCamera') === expectOrtho;
    if (done.current || frames.current < 4 || !cameraOk) return;
    done.current = true;
    // One more tick so the last frame is presented before the screenshot.
    requestAnimationFrame(() => requestAnimationFrame(onReady));
  });

  // The canvas renders on demand: keep asking for frames until the signal fired.
  useEffect(() => {
    const id = setInterval(() => {
      if (done.current) clearInterval(id);
      else invalidate();
    }, 40);
    return () => clearInterval(id);
  }, [invalidate]);

  return null;
}

export function PosePreviewPage() {
  const technique = useMemo(() => {
    const parsed = contentTechniqueSchema.safeParse(window.__TATAMAP_PREVIEW__);
    return parsed.success ? parsed.data : null;
  }, []);
  const [request, setRequest] = useState<(PreviewRequest & { id: number }) | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    window.__TATAMAP_POSE_PREVIEW__ = {
      show: (req) =>
        new Promise<void>((resolve) => {
          resolveRef.current = resolve;
          setRequest((prev) => ({ ...req, id: (prev?.id ?? 0) + 1 }));
        }),
    };
    return () => {
      window.__TATAMAP_POSE_PREVIEW__ = undefined;
    };
  }, []);

  const steps: ViewerStep[] | null = useMemo(() => {
    if (!technique) return null;
    return technique.steps.map((s, i) => ({
      transitionMs: s.transitionMs,
      pose: request?.camera && i === request.step ? { ...s.pose, camera: request.camera } : s.pose,
    }));
  }, [technique, request]);

  if (!technique || !steps) {
    return <p className="p-4">Pas de technique injectée (window.__TATAMAP_PREVIEW__).</p>;
  }
  if (!request) return <p className="p-4">En attente de show()…</p>;

  return (
    // Remounted for every request: each capture starts from a fresh canvas.
    <div
      id="pose-preview"
      style={{
        width: request.width ?? DEFAULT_WIDTH_PX,
        height: request.height ?? DEFAULT_HEIGHT_PX,
      }}
    >
      <TechniqueViewer
        key={request.id}
        className="h-full w-full"
        steps={steps}
        stepIndex={request.step}
        playing={false}
        interactive={false}
        view={request.view}
      >
        <ReadySignal
          view={request.view}
          onReady={() => {
            resolveRef.current?.();
            resolveRef.current = null;
          }}
        />
      </TechniqueViewer>
    </div>
  );
}
