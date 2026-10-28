import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { CurrentPose } from '@tatamap/shared';
import { useLayoutEffect, useRef } from 'react';
import { FighterMesh, type FighterMeshHandle } from './FighterMesh';
import { Tatami } from './Tatami';

export type ViewerStep = { pose: CurrentPose; transitionMs: number };

export type TechniqueViewerProps = {
  steps: ReadonlyArray<ViewerStep>;
  /** Controlled: step to show / play from. */
  stepIndex: number;
  className?: string;
  /** OrbitControls on/off (default true; false for thumbnails). */
  interactive?: boolean;
};

const DEFAULT_CAMERA = {
  position: [170, 170, 300],
  target: [0, 40, 20],
} as const;

type SceneProps = Pick<TechniqueViewerProps, 'steps' | 'stepIndex' | 'interactive'> & {
  target: readonly [number, number, number];
};

function Scene({ steps, stepIndex, interactive = true, target }: SceneProps) {
  const meRef = useRef<FighterMeshHandle>(null);
  const opponentRef = useRef<FighterMeshHandle>(null);

  useLayoutEffect(() => {
    const pose = steps[stepIndex]?.pose;
    if (!pose) return;
    meRef.current?.setPose(pose.fighters.me);
    opponentRef.current?.setPose(pose.fighters.opponent);
  }, [steps, stepIndex]);

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
  className,
  interactive = true,
}: TechniqueViewerProps) {
  const camera = steps[0]?.pose.camera ?? DEFAULT_CAMERA;

  return (
    <div className={className}>
      <Canvas camera={{ fov: 40, near: 1, far: 5000, position: [...camera.position] }}>
        <color attach="background" args={['#f1f5f9']} />
        <Scene
          steps={steps}
          stepIndex={stepIndex}
          interactive={interactive}
          target={camera.target}
        />
      </Canvas>
    </div>
  );
}
