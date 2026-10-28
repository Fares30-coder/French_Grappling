import {
  BONES_V1_11,
  FIGHTER_COLORS,
  type FighterId,
  type FighterPoseV1_11,
  HEAD_RADIUS_CM,
  JOINTS_V1_11,
  type JointV1_11,
} from '@tatamap/shared';
import { type Ref, useImperativeHandle, useRef } from 'react';
import { type Mesh, Quaternion, Vector3 } from 'three';

const JOINT_RADIUS_CM = 5;
const BONE_RADIUS_CM = 4;
const UP = new Vector3(0, 1, 0);

export type FighterMeshHandle = {
  /** Moves the existing meshes to `pose`. Imperative on purpose: no React state per frame. */
  setPose: (pose: FighterPoseV1_11) => void;
};

type Props = { fighter: FighterId; ref?: Ref<FighterMeshHandle> };

// Scratch objects reused across calls to avoid allocations in the render loop.
const from = new Vector3();
const to = new Vector3();
const dir = new Vector3();
const quat = new Quaternion();

export function FighterMesh({ fighter, ref }: Props) {
  const jointRefs = useRef(new Map<JointV1_11, Mesh>());
  const boneRefs = useRef<Array<Mesh | null>>([]);
  const color = FIGHTER_COLORS[fighter];

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
      {JOINTS_V1_11.map((joint) => (
        <mesh
          key={joint}
          ref={(mesh) => {
            if (mesh) jointRefs.current.set(joint, mesh);
            else jointRefs.current.delete(joint);
          }}
        >
          <sphereGeometry args={[joint === 'head' ? HEAD_RADIUS_CM : JOINT_RADIUS_CM, 24, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {BONES_V1_11.map(([a, b], i) => (
        <mesh
          key={`${a}-${b}`}
          ref={(mesh) => {
            boneRefs.current[i] = mesh;
          }}
        >
          {/* Unit-height cylinder: scale.y is set to the bone length. */}
          <cylinderGeometry args={[BONE_RADIUS_CM, BONE_RADIUS_CM, 1, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}
