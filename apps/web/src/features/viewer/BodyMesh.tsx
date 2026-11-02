import { useGLTF } from '@react-three/drei';
import {
  FIGHTER_COLORS,
  type FighterId,
  type FighterPoseV1_11,
  type HandState,
} from '@tatamap/shared';
import { type Ref, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type Bone,
  Group,
  Matrix4,
  MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { type BoneFrame, boneAxes, boneFrames, type RigState } from './rig';

/** The humanoid model (tools/blender/export_site_model.py), versioned so the PWA cache moves on. */
export const BODY_MODEL_URL = '/models/fighter.v1.glb';

/** What else a body needs to pose its hands: the opponent (automatic grips) and the step's hands. */
export type PoseContext = {
  other?: FighterPoseV1_11 | undefined;
  hands?: Partial<Record<'L' | 'R', HandState>> | undefined;
};

export type BodyMeshHandle = {
  setPose: (pose: FighterPoseV1_11, context?: PoseContext) => void;
};

/** Longer than this between two poses is not playback: the body jumps instead of turning. */
const MAX_SMOOTH_GAP_S = 0.2;
/** Editor: the body under the pickable spheres. */
const TRANSLUCENT_OPACITY = 0.35;

type Props = {
  fighter: FighterId;
  ref?: Ref<BodyMeshHandle>;
  /** Editor: see-through, so the joint spheres inside stay visible. */
  translucent?: boolean;
  /** The pose to show when the body appears (the model loads after the first poses). */
  initialPose?: () => { pose: FighterPoseV1_11; context?: PoseContext } | null;
  /** Called once the body is on screen (the model is loaded). */
  onReady?: () => void;
};

type Rest = Record<string, [number[], number[], number[]]>;

/** three's GLTFLoader drops `[ ] . : /` from node names (`upper_arm.L` -> `upper_armL`). */
const nodeName = (bone: string) => bone.replace(/[[\].:/]/g, '');

/** Armature-space matrix of a bone from its frame: axes, origin at the head, y stretched by `scaleY`. */
function frameMatrix(frame: BoneFrame, scaleY: number, out: Matrix4): Matrix4 {
  const [x, y, z] = boneAxes(frame.head, frame.tail, frame.z);
  return out.set(
    x.x,
    y.x * scaleY,
    z.x,
    frame.head.x,
    x.y,
    y.y * scaleY,
    z.y,
    frame.head.y,
    x.z,
    y.z * scaleY,
    z.z,
    frame.head.z,
    0,
    0,
    0,
    1,
  );
}

type Driven = {
  bone: Bone;
  /** Rest length of the bone (cm). */
  length: number;
  /** inverse(parent world) and rest(frame)^-1 * rest(world), fixed at load. */
  parentInverse: Matrix4;
  fromRest: Matrix4;
};

/**
 * One fighter's skinned body. Each bone is placed like `pose_humanoid` does in Blender: the skin
 * moves by frame(now) * frame(rest)^-1, in Tatamap cm. The glTF's axis conventions cancel out,
 * since the rest world matrices are measured on the loaded model.
 */
function buildBody(scene: Object3D, rest: Rest, color: string, translucent: boolean) {
  const root = new Group();
  root.scale.setScalar(100); // glTF metres -> Tatamap cm (same axes: y up)
  const model = cloneSkinned(scene);
  root.add(model);
  const material = new MeshStandardMaterial({
    color,
    roughness: 0.55,
    ...(translucent ? { transparent: true, opacity: TRANSLUCENT_OPACITY, depthWrite: false } : {}),
  });
  model.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) {
      const mesh = o as SkinnedMesh;
      mesh.material = material;
      mesh.frustumCulled = false; // the bounding sphere is the rest pose's
      if (translucent) mesh.raycast = () => {};
    }
  });
  root.updateMatrixWorld(true);
  // Loaded bone name -> the bone and its rest.
  const driven = new Map<string, Driven>();
  const restMatrix = new Matrix4();
  const restByNode = new Map(Object.entries(rest).map(([name, frame]) => [nodeName(name), frame]));
  model.traverse((o) => {
    const bone = o as Bone;
    const frame = bone.isBone ? restByNode.get(bone.name) : undefined;
    if (!frame || !bone.parent) return;
    const [head, tail, z] = frame.map((p) => new Vector3(p[0], p[1], p[2])) as [
      Vector3,
      Vector3,
      Vector3,
    ];
    frameMatrix({ head, tail, z }, 1, restMatrix);
    driven.set(bone.name, {
      bone,
      length: head.distanceTo(tail),
      parentInverse: bone.parent.matrixWorld.clone().invert(),
      fromRest: restMatrix.clone().invert().multiply(bone.matrixWorld),
    });
    bone.matrixAutoUpdate = false;
  });
  const missing = Object.keys(rest).filter((name) => !driven.has(nodeName(name)));
  if (missing.length > 0)
    throw new Error(`${BODY_MODEL_URL}: bones not found: ${missing.join(', ')}`);
  return { root, driven, material };
}

export function BodyMesh({ fighter, ref, translucent = false, initialPose, onReady }: Props) {
  const gltf = useGLTF(BODY_MODEL_URL, false); // no Draco: its decoder comes from a CDN
  const rest = gltf.scene.userData.tatamapRest as Rest | undefined;
  if (!rest) throw new Error(`${BODY_MODEL_URL}: no rest frames (tatamapRest)`);
  const body = useMemo(
    () => buildBody(gltf.scene, rest, FIGHTER_COLORS[fighter], translucent),
    [gltf.scene, rest, fighter, translucent],
  );
  useLayoutEffect(() => () => body.material.dispose(), [body]);

  const prevRef = useRef<{ state: RigState; at: number } | null>(null);
  const scratch = useMemo(() => new Matrix4(), []);

  const handle: BodyMeshHandle = useMemo(
    () => ({
      setPose(pose, context = {}) {
        const now = performance.now() / 1000;
        const last = prevRef.current;
        const dt = last ? now - last.at : Infinity;
        const prev = dt <= MAX_SMOOTH_GAP_S ? last?.state : null;
        const { bones, state } = boneFrames(pose, {
          other: context.other,
          hands: context.hands,
          prev,
          dtSeconds: prev ? dt : 0,
        });
        prevRef.current = { state, at: now };
        for (const [name, frame] of bones) {
          const d = body.driven.get(nodeName(name));
          if (!d) continue;
          frameMatrix(frame, frame.head.distanceTo(frame.tail) / d.length, scratch);
          d.bone.matrix.copy(d.parentInverse).multiply(scratch).multiply(d.fromRest);
          d.bone.matrixWorldNeedsUpdate = true;
        }
      },
    }),
    [body, scratch],
  );
  useImperativeHandle(ref, () => handle, [handle]);

  // The model arrives after the first poses: show the current one straight away.
  useLayoutEffect(() => {
    const current = initialPose?.();
    if (current) handle.setPose(current.pose, current.context);
    onReady?.();
  }, [handle, initialPose, onReady]);

  return <primitive object={body.root} />;
}

useGLTF.preload(BODY_MODEL_URL, false);
