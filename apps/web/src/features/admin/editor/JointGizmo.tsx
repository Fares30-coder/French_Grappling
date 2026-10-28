import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { Vec3 } from '@tatamap/shared';
import { useLayoutEffect, useState } from 'react';
import type { Group } from 'three';
import type { ViewPreset } from '../../viewer/camera';

type Props = {
  /** Where the selected joint is, in the current step. */
  position: Vec3;
  view: ViewPreset;
  onBegin: () => void;
  onMove: (position: Vec3) => void;
  onEnd: () => void;
};

/**
 * Translation handles on the selected joint. A proxy object sits at the joint; the editor state
 * is the source of truth, so the proxy only reports where the user dragged it.
 */
export function JointGizmo({ position, view, onBegin, onMove, onEnd }: Props) {
  const [proxy, setProxy] = useState<Group | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  // Follows the state (clamped, undone, typed in the panel...).
  useLayoutEffect(() => {
    if (!proxy) return;
    proxy.position.set(position[0], position[1], position[2]);
    invalidate();
  }, [proxy, position, invalidate]);

  return (
    <>
      <group ref={setProxy} />
      {proxy && (
        <TransformControls
          object={proxy}
          mode="translate"
          translationSnap={1}
          // Orthographic views look along one axis: only offer the two visible ones.
          showX={view !== 'side'}
          showY={view !== 'top'}
          showZ={view !== 'front'}
          onMouseDown={onBegin}
          onMouseUp={onEnd}
          onObjectChange={() => onMove([proxy.position.x, proxy.position.y, proxy.position.z])}
        />
      )}
    </>
  );
}
