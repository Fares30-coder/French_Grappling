import { useThree } from '@react-three/fiber';
import type { CameraHint } from '@tatamap/shared';
import { type RefObject, useEffect } from 'react';

type Controls = { target?: { x: number; y: number; z: number } };

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Lives inside the canvas and exposes "read the camera as it is now" to the page through `captureRef`
 * (the button sits outside the canvas, where `useThree` is not available).
 */
export function CameraCapture({
  captureRef,
}: {
  captureRef: RefObject<(() => CameraHint | null) | null>;
}) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    captureRef.current = () => {
      const { camera, controls } = get();
      const target = (controls as Controls | null)?.target;
      if (!target) return null;
      return {
        position: [round1(camera.position.x), round1(camera.position.y), round1(camera.position.z)],
        target: [round1(target.x), round1(target.y), round1(target.z)],
      };
    };
    return () => {
      captureRef.current = null;
    };
  }, [get, captureRef]);
  return null;
}
