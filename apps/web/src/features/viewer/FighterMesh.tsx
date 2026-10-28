import type { ThreeEvent } from '@react-three/fiber';
import {
  BONES_V1_11,
  FIGHTER_COLORS,
  type FighterId,
  type FighterPoseV1_11,
  HEAD_RADIUS_CM,
  JOINTS_V1_11,
  type JointV1_11,
} from '@tatamap/shared';
import { type Ref, useEffect, useImperativeHandle, useRef } from 'react';
import { type Mesh, Quaternion, Vector3 } from 'three';

const JOINT_RADIUS_CM = 5;
const BONE_RADIUS_CM = 4;
const UP = new Vector3(0, 1, 0);

export type FighterMeshHandle = {
  /** Moves the existing meshes to `pose`. Imperative on purpose: no React state per frame. */
  setPose: (pose: FighterPoseV1_11) => void;
};

const GHOST_OPACITY = 0.25;
const SELECTED_SCALE = 1.4;

type Props = {
  fighter: FighterId;
  ref?: Ref<FighterMeshHandle>;
  /** 'ghost': translucent "onion skin", never pickable. */
  variant?: 'solid' | 'ghost';
  /** Editor: when set, joint spheres are pickable. Absent on the public site (no picking, no hand cursor). */
  onJointPointerDown?: (joint: JointV1_11) => void;
  /** Editor: joint of this fighter to highlight. */
  selectedJoint?: JointV1_11 | null;
};

// Scratch objects reused across calls to avoid allocations in the render loop.
const from = new Vector3();
const to = new Vector3();
const dir = new Vector3();
const quat = new Quaternion();

export function FighterMesh({
  fighter,
  ref,
  variant = 'solid',
  onJointPointerDown,
  selectedJoint = null,
}: Props) {
  const jointRefs = useRef(new Map<JointV1_11, Mesh>());
  const boneRefs = useRef<Array<Mesh | null>>([]);
  const color = FIGHTER_COLORS[fighter];
  const ghost = variant === 'ghost';
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

  useImperativeHandle(ref, () => ({
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
  }));

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
