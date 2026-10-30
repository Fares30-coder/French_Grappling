import { View } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { TechniqueScene, type ViewerStep } from './TechniqueScene';
import { PUBLIC_SCENE } from './theme';
import { useAnyThumbnailPlaying, useRegisterPlaying } from './thumbnail-playing';

// Lazy-loaded by the library: three.js stays out of the first paint.

/**
 * ADR 0003 D4: ONE fixed, transparent <Canvas> over the page and one drei <View> per thumbnail,
 * so a grid of cards uses a single WebGL context. Render once per page, inside a
 * ThumbnailPlayingProvider. Above the cards, below the phone tab bar (z-20).
 */
export function ThumbnailCanvas() {
  const playing = useAnyThumbnailPlaying();
  return (
    <Canvas
      aria-hidden="true"
      frameloop={playing ? 'always' : 'demand'}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}
    >
      <View.Port />
      <InvalidateOnScroll />
    </Canvas>
  );
}

/** Rendering on demand: redraw when the page scrolls or resizes, so views follow their cards. */
function InvalidateOnScroll() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    window.addEventListener('scroll', redraw, { passive: true });
    window.addEventListener('resize', redraw);
    return () => {
      window.removeEventListener('scroll', redraw);
      window.removeEventListener('resize', redraw);
    };
  }, [invalidate]);
  return null;
}

type TechniqueThumbnailProps = {
  steps: ReadonlyArray<ViewerStep>;
  playing: boolean;
  className?: string;
};

/** A non-interactive 3D preview drawn by the shared canvas. Shows step 1 until it plays. */
export function TechniqueThumbnail({ steps, playing, className }: TechniqueThumbnailProps) {
  useRegisterPlaying(playing);
  return (
    <View className={className}>
      <TechniqueScene
        steps={steps}
        stepIndex={0}
        playing={playing}
        interactive={false}
        tatamiColor={PUBLIC_SCENE.tatami}
      />
    </View>
  );
}
