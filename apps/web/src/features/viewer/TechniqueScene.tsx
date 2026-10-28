import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { type CurrentPose, DEFAULT_HOLD_MS } from '@tatamap/shared';
import {
  type ElementRef,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { OrthographicCamera as OrthographicCameraImpl } from 'three';
import { frameCamera, type ViewPreset } from './camera';
import { FighterMesh, type FighterMeshHandle } from './FighterMesh';
import { interpolatePose } from './interpolate';
import { shouldReapplyPose } from './reapply';
import { Tatami } from './Tatami';
import { buildTimeline, isStepEcho, sampleTimeline, timeAtStep } from './timeline';

export type { ViewPreset } from './camera';

export type ViewerStep = { pose: CurrentPose; transitionMs: number };

export type TechniqueSceneProps = {
  steps: ReadonlyArray<ViewerStep>;
  /** Controlled: step to show / play from. */
  stepIndex: number;
  playing: boolean;
  /** Playback speed multiplier (default 1). */
  speed?: number;
  /** Restart on the first step after the last one (default true). */
  loop?: boolean;
  /** How long each step is held, in ms (default DEFAULT_HOLD_MS). */
  holdMs?: number;
  /** OrbitControls on/off (default true; false for thumbnails). */
  interactive?: boolean;
  /** Emitted when playback enters a new step. */
  onStepChange?: (index: number) => void;

  /** Framing, applied on mount and when `view` or `cameraKey` changes (never forced during playback otherwise). */
  view?: ViewPreset;
  /** Bump to re-apply the current step's camera (e.g. "Recentrer"). */
  cameraKey?: number;

  /** Extra 3D content rendered inside the scene (TransformControls, camera capture...). */
  children?: ReactNode;
};

// A long frame (background tab, breakpoint) must not make the animation jump.
const MAX_DELTA_S = 0.1;

/**
 * Everything inside the canvas. Owns its camera (drei cameras with makeDefault) and its controls,
 * so it works the same in a <Canvas> or in a drei <View>.
 */
export function TechniqueScene({
  steps,
  stepIndex,
  playing,
  speed = 1,
  loop = true,
  holdMs = DEFAULT_HOLD_MS,
  interactive = true,
  onStepChange,
  view = 'step',
  cameraKey = 0,
  children,
}: TechniqueSceneProps) {
  const meRef = useRef<FighterMeshHandle>(null);
  const opponentRef = useRef<FighterMeshHandle>(null);
  const timeline = useMemo(() => buildTimeline(steps, { holdMs }), [steps, holdMs]);
  const invalidate = useThree((s) => s.invalidate);

  const elapsedRef = useRef(0);
  // Step currently shown / highlighted, as far as this component knows.
  const shownStepRef = useRef<number | null>(null);
  // Last index emitted through onStepChange (only tracked when a listener exists).
  const lastEmittedRef = useRef<number | null>(null);
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;
  // Previous values, to tell what changed between two runs of the pose effect.
  const prevStepIndexRef = useRef<number | null>(null);
  const prevStepsRef = useRef<ReadonlyArray<ViewerStep> | null>(null);

  const applyPose = useCallback(
    (pose: CurrentPose) => {
      meRef.current?.setPose(pose.fighters.me);
      opponentRef.current?.setPose(pose.fighters.opponent);
      invalidate(); // the canvas only renders on demand when stopped
    },
    [invalidate],
  );

  // `stepIndex` changed from outside, or `steps` edited while stopped: show that step's pose.
  // Echoes of our own onStepChange are ignored, so there is no feedback loop.
  useLayoutEffect(() => {
    const stepIndexChanged = prevStepIndexRef.current !== stepIndex;
    const stepsChanged = prevStepsRef.current !== steps;
    prevStepIndexRef.current = stepIndex;
    prevStepsRef.current = steps;
    const isEcho = isStepEcho(shownStepRef.current, lastEmittedRef.current, stepIndex);
    if (!shouldReapplyPose({ playing, stepIndexChanged, stepsChanged, isEcho })) return;
    lastEmittedRef.current = null;
    shownStepRef.current = stepIndex;
    elapsedRef.current = timeAtStep(timeline, stepIndex);
    const pose = steps[stepIndex]?.pose;
    if (pose) applyPose(pose);
  }, [stepIndex, timeline, steps, playing, applyPose]);

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

  // Camera framing: on mount and whenever the view preset or `cameraKey` changes.
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const widthRef = useRef(width);
  widthRef.current = width;
  const stepHintRef = useRef(steps[stepIndex]?.pose.camera);
  stepHintRef.current = steps[stepIndex]?.pose.camera;
  const [controls, setControls] = useState<ElementRef<typeof OrbitControls> | null>(null);
  const isOrthoView = view !== 'step';

  // biome-ignore lint/correctness/useExhaustiveDependencies: `cameraKey` is the explicit re-frame trigger; the step hint and the width are read at that moment on purpose
  useLayoutEffect(() => {
    // The default camera is swapped when the projection changes: wait for the matching one.
    const isOrtho = camera instanceof OrthographicCameraImpl;
    if (isOrtho !== isOrthoView) return;
    if (interactive && !controls) return;
    const frame = frameCamera(view, stepHintRef.current, widthRef.current);
    camera.position.set(...frame.position);
    camera.up.set(...frame.up);
    if (isOrtho && frame.zoom !== undefined) camera.zoom = frame.zoom;
    camera.lookAt(...frame.target);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...frame.target);
      controls.update();
    }
    invalidate();
  }, [camera, controls, view, cameraKey, isOrthoView, interactive, invalidate]);

  return (
    <>
      {isOrthoView ? (
        <OrthographicCamera makeDefault near={0.1} far={5000} />
      ) : (
        <PerspectiveCamera makeDefault fov={40} near={1} far={5000} />
      )}
      <ambientLight intensity={0.7} />
      <directionalLight position={[200, 400, 300]} intensity={1.6} />
      <Tatami />
      <FighterMesh fighter="me" ref={meRef} />
      <FighterMesh fighter="opponent" ref={opponentRef} />
      {interactive && (
        <OrbitControls
          ref={setControls}
          makeDefault
          // Orthographic axis views only pan and zoom.
          enableRotate={!isOrthoView}
        />
      )}
      {children}
    </>
  );
}
