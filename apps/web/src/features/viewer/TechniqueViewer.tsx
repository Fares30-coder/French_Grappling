import { Canvas } from '@react-three/fiber';
import { TechniqueScene, type TechniqueSceneProps } from './TechniqueScene';

export type { ViewerStep } from './TechniqueScene';
export type TechniqueViewerProps = TechniqueSceneProps & { className?: string };

/** The single reusable 3D viewer = <Canvas> + <TechniqueScene>. Children go inside the canvas. */
export function TechniqueViewer({ className, ...scene }: TechniqueViewerProps) {
  return (
    <div className={className}>
      {/* Stopped = render on demand: the GPU idles in pause. */}
      <Canvas frameloop={scene.playing ? 'always' : 'demand'} dpr={[1, 2]}>
        <color attach="background" args={['#f1f5f9']} />
        <TechniqueScene {...scene} />
      </Canvas>
    </div>
  );
}
