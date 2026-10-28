import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type CurrentPose, DEFAULT_CAMERA, DEFAULT_HOLD_MS } from '@tatamap/shared';
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { FighterMesh, type FighterMeshHandle } from './FighterMesh';
import { interpolatePose } from './interpolate';
import { Tatami } from './Tatami';
import { buildTimeline, isStepEcho, sampleTimeline, timeAtStep } from './timeline';

export type ViewerStep = { pose: CurrentPose; transitionMs: number };

export type TechniqueViewerProps = {
  steps: ReadonlyArray<ViewerStep>;
  /** Controlled: step to show / play from. */
  stepIndex: number;
  playing: boolean;
  /** Playback speed multiplier (default 1). */
  speed?: number;
  /** Restart on the first step after the last one (default true). */
  loop?: boolean;
  /** How long each step is held, in ms (default 1200). */
  holdMs?: number;
  /** OrbitControls on/off (default true; false for thumbnails). */
  interactive?: boolean;
  /** Emitted when playback enters a new step. */
  onStepChange?: (index: number) => void;
  className?: string;
};

// A long frame (background tab, breakpoint) must not make the animation jump.
const MAX_DELTA_S = 0.1;

type SceneProps = Required<
  Pick<TechniqueViewerProps, 'steps' | 'stepIndex' | 'playing' | 'speed' | 'loop' | 'holdMs'>
> &
  Pick<TechniqueViewerProps, 'onStepChange' | 'interactive'> & {
    target: readonly [number, number, number];
  };

function Scene({
  steps,
  stepIndex,
  playing,
  speed,
  loop,
  holdMs,
  interactive = true,
  onStepChange,
  target,
}: SceneProps) {
  const meRef = useRef<FighterMeshHandle>(null);
  const opponentRef = useRef<FighterMeshHandle>(null);
  const timeline = useMemo(() => buildTimeline(steps, { holdMs }), [steps, holdMs]);

  const elapsedRef = useRef(0);
  // Step currently shown / highlighted, as far as this component knows.
  const shownStepRef = useRef<number | null>(null);
  // Last index emitted through onStepChange (only tracked when a listener exists).
  const lastEmittedRef = useRef<number | null>(null);
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  const applyPose = useCallback((pose: CurrentPose) => {
    meRef.current?.setPose(pose.fighters.me);
    opponentRef.current?.setPose(pose.fighters.opponent);
  }, []);

  // `stepIndex` changed from outside (or first mount): jump to that step. Echoes of our own
  // onStepChange are ignored, so there is no feedback loop.
  useLayoutEffect(() => {
    if (isStepEcho(shownStepRef.current, lastEmittedRef.current, stepIndex)) return;
    lastEmittedRef.current = null;
    shownStepRef.current = stepIndex;
    elapsedRef.current = timeAtStep(timeline, stepIndex);
    const pose = steps[stepIndex]?.pose;
    if (pose) applyPose(pose);
  }, [stepIndex, timeline, steps, applyPose]);

  useFrame((_, delta) => {
    if (!playing || steps.length === 0) return;
    elapsedRef.current += Math.min(delta, MAX_DELTA_S) * 1000 * speed;

    const {
      stepIndex: from,
      nextIndex: to,
      t,
    } = sampleTimeline(timeline, elapsedRef.current, {
      loop,
    });
    const a = steps[from]?.pose;
    const b = steps[to]?.pose;
    if (!a || !b) return;
    applyPose(t === 0 ? a : interpolatePose(a, b, t));

    // Entering a transition means entering the next step.
    const entered = t > 0 ? to : from;
    if (entered !== shownStepRef.current) {
      shownStepRef.current = entered;
      if (onStepChangeRef.current) {
        lastEmittedRef.current = entered;
        onStepChangeRef.current(entered);
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[200, 400, 300]} intensity={1.6} />
      <Tatami />
      <FighterMesh fighter="me" ref={meRef} />
      <FighterMesh fighter="opponent" ref={opponentRef} />
      {interactive && <OrbitControls makeDefault target={[...target]} />}
    </>
  );
}

/** The single reusable 3D viewer (technique page, thumbnails, editor). */
export function TechniqueViewer({
  steps,
  stepIndex,
  playing,
  speed = 1,
  loop = true,
  holdMs = DEFAULT_HOLD_MS,
  interactive = true,
  onStepChange,
  className,
}: TechniqueViewerProps) {
  const camera = steps[0]?.pose.camera ?? DEFAULT_CAMERA;

  return (
    <div className={className}>
      <Canvas camera={{ fov: 40, near: 1, far: 5000, position: [...camera.position] }}>
        <color attach="background" args={['#f1f5f9']} />
        <Scene
          steps={steps}
          stepIndex={stepIndex}
          playing={playing}
          speed={speed}
          loop={loop}
          holdMs={holdMs}
          interactive={interactive}
          onStepChange={onStepChange}
          target={camera.target}
        />
      </Canvas>
    </div>
  );
}
