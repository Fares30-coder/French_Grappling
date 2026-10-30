import { Canvas, useFrame } from '@react-three/fiber';
import { DEFAULT_TRANSITION_MS } from '@tatamap/shared';
import { Fragment, useRef } from 'react';
import { TechniqueScene, type ViewerStep } from './TechniqueScene';
import { PUBLIC_SCENE } from './theme';
import { setSnapshot, usePendingSnapshot } from './thumbnail-store';

// Lazy-loaded by the library: three.js stays out of the first paint.
//
// ADR 0003 D4, fallback: a fixed canvas with drei Views lagged behind the cards while scrolling
// on phones. Cards now show still images (rendered here, one at a time, by an off-screen canvas)
// and only the playing card mounts a live canvas inside itself.

/** Size of the still images: the cards' 16:10 frame. */
const SNAPSHOT_WIDTH = 480;
const SNAPSHOT_HEIGHT = 300;
const FRAMING_MARGIN = 1.15;

/** Renders the queued stills, one per mount, then unmounts (freeing its WebGL context). */
export function SnapshotRenderer() {
  const pending = usePendingSnapshot();
  if (!pending) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: -10_000,
        top: 0,
        width: SNAPSHOT_WIDTH,
        height: SNAPSHOT_HEIGHT,
        pointerEvents: 'none',
      }}
    >
      <Canvas dpr={1} frameloop="always">
        <color attach="background" args={[PUBLIC_SCENE.thumbnail]} />
        {/* Keyed: a fresh scene and capture for each image. */}
        <Fragment key={pending.key}>
          <TechniqueScene
            steps={[{ pose: pending.pose, transitionMs: DEFAULT_TRANSITION_MS }]}
            stepIndex={0}
            playing={false}
            interactive={false}
            framingMargin={FRAMING_MARGIN}
            tatamiColor={PUBLIC_SCENE.tatami}
          />
          <Capture onCapture={(url) => setSnapshot(pending.key, url)} />
        </Fragment>
      </Canvas>
    </div>
  );
}

/** Takes over rendering and captures the canvas on the 2nd frame (pose and camera are set). */
function Capture({ onCapture }: { onCapture: (url: string) => void }) {
  const frames = useRef(0);
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    frames.current += 1;
    // Read right after rendering: no preserveDrawingBuffer needed.
    if (frames.current === 2) onCapture(gl.domElement.toDataURL('image/webp', 0.85));
  }, 1);
  return null;
}

/** The playing card's own small live canvas, same framing and colors as its still image. */
export function LiveThumbnail({ steps }: { steps: ReadonlyArray<ViewerStep> }) {
  return (
    <Canvas aria-hidden="true" dpr={[1, 2]} frameloop="always">
      <color attach="background" args={[PUBLIC_SCENE.thumbnail]} />
      <TechniqueScene
        steps={steps}
        stepIndex={0}
        playing
        interactive={false}
        framingMargin={FRAMING_MARGIN}
        tatamiColor={PUBLIC_SCENE.tatami}
      />
    </Canvas>
  );
}
