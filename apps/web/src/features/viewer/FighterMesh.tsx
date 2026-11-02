import type { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import {
  BONES_V1_11,
  FIGHTER_COLORS,
  type FighterId,
  type FighterPoseV1_11,
  HEAD_RADIUS_CM,
  JOINTS_V1_11,
  type JointV1_11,
} from '@tatamap/shared';
import {
  Component,
  type ReactNode,
  type Ref,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Mesh, Quaternion, Vector3 } from 'three';
import { BodyMesh, type BodyMeshHandle, type PoseContext } from './BodyMesh';

const JOINT_RADIUS_CM = 5;
const BONE_RADIUS_CM = 4;
const UP = new Vector3(0, 1, 0);

export type FighterMeshHandle = {
  /**
   * Moves the fighter to `pose`. Imperative on purpose: no React state per frame. `context`
   * (the opponent, the step's hands) shapes the body's hands.
   */
  setPose: (pose: FighterPoseV1_11, context?: PoseContext) => void;
};

type StickHandle = { setPose: (pose: FighterPoseV1_11) => void };

const GHOST_OPACITY = 0.25;
const SELECTED_SCALE = 1.4;

type Props = {
  fighter: FighterId;
  ref?: Ref<FighterMeshHandle>;
  /** 'ghost': translucent "onion skin", never pickable, always sticks. */
  variant?: 'solid' | 'ghost';
  /** Editor: when set, joint spheres are pickable. Absent on the public site (no picking, no hand cursor). */
  onJointPointerDown?: (joint: JointV1_11) => void;
  /** Editor: joint of this fighter to highlight. */
  selectedJoint?: JointV1_11 | null;
};

type LastPose = { pose: FighterPoseV1_11; context?: PoseContext };

/**
 * A fighter: the humanoid body (BodyMesh), with the joint spheres on top in the editor. Sticks
 * (spheres and cylinders) stand in while the model loads, if it fails to load, and for the ghost.
 */
export function FighterMesh({
  fighter,
  ref,
  variant = 'solid',
  onJointPointerDown,
  selectedJoint = null,
}: Props) {
  const ghost = variant === 'ghost';
  const pickable = !ghost && onJointPointerDown !== undefined;
  const [bodyState, setBodyState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const withBody = !ghost && bodyState !== 'failed';
  const showSticks = ghost || pickable || bodyState !== 'ready';
  const stickRef = useRef<StickHandle>(null);
  const bodyRef = useRef<BodyMeshHandle>(null);
  const lastRef = useRef<LastPose | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const lastPose = useCallback(() => lastRef.current, []);
  const onBodyReady = useCallback(() => {
    setBodyState('ready');
    invalidate();
  }, [invalidate]);

  useImperativeHandle(ref, () => ({
    setPose(pose, context) {
      lastRef.current = context ? { pose, context } : { pose };
      stickRef.current?.setPose(pose);
      bodyRef.current?.setPose(pose, context);
    },
  }));

  return (
    <group>
      {showSticks && (
        <Sticks
          fighter={fighter}
          ref={stickRef}
          ghost={ghost}
          onJointPointerDown={pickable ? onJointPointerDown : undefined}
          selectedJoint={selectedJoint}
          initialPose={lastPose}
          // Over the body, only the pickable spheres: the cylinders would hide it.
          spheresOnly={pickable && bodyState === 'ready'}
        />
      )}
      {withBody && (
        <BodyErrorBoundary onError={() => setBodyState('failed')}>
          <Suspense fallback={null}>
            <BodyMesh
              fighter={fighter}
              ref={bodyRef}
              translucent={pickable}
              initialPose={lastPose}
              onReady={onBodyReady}
            />
          </Suspense>
        </BodyErrorBoundary>
      )}
    </group>
  );
}

/** Falls back to the sticks when the model cannot load (offline before caching, bad file). */
class BodyErrorBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn('Tatamap: humanoid model unavailable, showing sticks.', error);
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

type StickProps = {
  fighter: FighterId;
  ref?: Ref<StickHandle>;
  ghost: boolean;
  onJointPointerDown?: ((joint: JointV1_11) => void) | undefined;
  selectedJoint: JointV1_11 | null;
  initialPose: () => LastPose | null;
  spheresOnly: boolean;
};

// Scratch objects reused across calls to avoid allocations in the render loop.
const from = new Vector3();
const to = new Vector3();
const dir = new Vector3();
const quat = new Quaternion();

function Sticks({
  fighter,
  ref,
  ghost,
  onJointPointerDown,
  selectedJoint,
  initialPose,
  spheresOnly,
}: StickProps) {
  const jointRefs = useRef(new Map<JointV1_11, Mesh>());
  const boneRefs = useRef<Array<Mesh | null>>([]);
  const color = FIGHTER_COLORS[fighter];
  const pickable = !ghost && onJointPointerDown !== undefined;
  const materialProps = ghost
    ? ({ transparent: true, opacity: GHOST_OPACITY, depthWrite: false } as const)
    : {};

  // Do not leave a hand cursor behind if the mesh goes away while hovered.
  useEffect(
    () => () => {
      if (pickable) document.body.style.cursor = '';
    },
    [pickable],
  );

  const handle: StickHandle = useMemo(
    () => ({
      setPose(pose) {
        for (const joint of JOINTS_V1_11) {
          const mesh = jointRefs.current.get(joint);
          const p = pose[joint];
          mesh?.position.set(p[0], p[1], p[2]);
        }
        BONES_V1_11.forEach(([a, b], i) => {
          const bone = boneRefs.current[i];
          if (!bone) return;
          const pa = pose[a];
          const pb = pose[b];
          from.set(pa[0], pa[1], pa[2]);
          to.set(pb[0], pb[1], pb[2]);
          dir.subVectors(to, from);
          const length = dir.length();
          bone.position.addVectors(from, to).multiplyScalar(0.5);
          if (length > 1e-6)
            bone.quaternion.copy(quat.setFromUnitVectors(UP, dir.divideScalar(length)));
          bone.scale.set(1, Math.max(length, 1e-6), 1);
        });
      },
    }),
    [],
  );
  useImperativeHandle(ref, () => handle, [handle]);
  // Mounted after the first poses (fallback, editor): show the current one straight away.
  useLayoutEffect(() => {
    const current = initialPose();
    if (current) handle.setPose(current.pose);
  }, [handle, initialPose]);

  return (
    <group>
      {JOINTS_V1_11.map((joint) => {
        const selected = joint === selectedJoint;
        // Handlers are only passed when pickable, so the public viewer registers no pointer events.
        const jointEvents = pickable
          ? {
              onPointerDown: (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                onJointPointerDown?.(joint);
              },
              onPointerOver: (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                document.body.style.cursor = 'pointer';
              },
              onPointerOut: () => {
                document.body.style.cursor = '';
              },
            }
          : // A ghost never takes events: it must not hide the solid sphere behind it.
            ghost
            ? { raycast: () => null }
            : {};
        return (
          <mesh
            key={joint}
            ref={(mesh) => {
              if (mesh) jointRefs.current.set(joint, mesh);
              else jointRefs.current.delete(joint);
            }}
            scale={selected ? SELECTED_SCALE : 1}
            {...jointEvents}
          >
            <sphereGeometry args={[joint === 'head' ? HEAD_RADIUS_CM : JOINT_RADIUS_CM, 24, 16]} />
            <meshStandardMaterial
              color={color}
              emissive={selected ? color : '#000000'}
              emissiveIntensity={selected ? 0.6 : 0}
              {...materialProps}
            />
          </mesh>
        );
      })}
      {BONES_V1_11.map(([a, b], i) => (
        <mesh
          visible={!spheresOnly}
          key={`${a}-${b}`}
          {...(ghost ? { raycast: () => null } : {})}
          ref={(mesh) => {
            boneRefs.current[i] = mesh;
          }}
        >
          {/* Unit-height cylinder: scale.y is set to the bone length. */}
          <cylinderGeometry args={[BONE_RADIUS_CM, BONE_RADIUS_CM, 1, 12]} />
          <meshStandardMaterial color={color} {...materialProps} />
        </mesh>
      ))}
    </group>
  );
}
