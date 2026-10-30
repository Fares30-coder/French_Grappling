import { Canvas } from '@react-three/fiber';
import { TechniqueScene, type TechniqueSceneProps } from './TechniqueScene';

export type { ViewerStep } from './TechniqueScene';
export type TechniqueViewerProps = TechniqueSceneProps & {
  className?: string;
  /** Clear color behind the scene (the public pages are dark, the editor light). */
  background?: string;
};

/** The single reusable 3D viewer = <Canvas> + <TechniqueScene>. Children go inside the canvas. */
export function TechniqueViewer({
  className,
  background = '#f1f5f9',
  ...scene
}: TechniqueViewerProps) {
  return (
    <div className={className}>
      {/* Stopped = render on demand: the GPU idles in pause. */}
      <Canvas frameloop={scene.playing ? 'always' : 'demand'} dpr={[1, 2]}>
        <color attach="background" args={[background]} />
        <TechniqueScene {...scene} />
      </Canvas>
    </div>
  );
}
