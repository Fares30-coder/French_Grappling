import { useGLTF } from '@react-three/drei';
import {
  FIGHTER_COLORS,
  type FighterId,
  type FighterPoseV1_11,
  type HandState,
} from '@tatamap/shared';
import { type Ref, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Group,
  Matrix4,
  MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyDualQuaternionSkinning, createBoneTexture, writeBone } from './dq-skinning';
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
  /** Index of the bone in the skin (the shader's bone texture row). */
  index: number;
  /** Rest length of the bone (cm). */
  length: number;
  rest: Matrix4;
  restInverse: Matrix4;
};

/**
 * One fighter's skinned body, skinned like Blender's videos (dual quaternions, see
 * dq-skinning.ts). Each bone moves the skin by frame(now) * frame(rest)^-1 in Tatamap cm, as
 * `pose_humanoid` does in Blender; that transform is carried into the mesh's own space, so the
 * glTF's axis conventions do not matter.
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
  let mesh: SkinnedMesh | null = null;
  model.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
  });
  const skin = mesh as SkinnedMesh | null;
  if (!skin) throw new Error(`${BODY_MODEL_URL}: no skinned mesh`);
  skin.material = material;
  skin.frustumCulled = false; // the bounding sphere is the rest pose's
  skin.raycast = () => {}; // never picked; three's CPU skinning would not match the shader
  root.updateMatrixWorld(true);
  const meshToWorld = skin.matrixWorld.clone();
  const worldToMesh = meshToWorld.clone().invert();
  const texture = createBoneTexture(skin.skeleton.bones.length);
  applyDualQuaternionSkinning(material, texture);

  // Loaded bone name -> its index in the skin and its rest frame.
  const driven = new Map<string, Driven>();
  const restByNode = new Map(Object.entries(rest).map(([name, frame]) => [nodeName(name), frame]));
  skin.skeleton.bones.forEach((bone, index) => {
    const frame = restByNode.get(bone.name);
    if (!frame) return;
    const [head, tail, z] = frame.map((p) => new Vector3(p[0], p[1], p[2])) as [
      Vector3,
      Vector3,
      Vector3,
    ];
    const restMatrix = frameMatrix({ head, tail, z }, 1, new Matrix4());
    driven.set(bone.name, {
      index,
      length: head.distanceTo(tail),
      rest: restMatrix,
      restInverse: restMatrix.clone().invert(),
    });
  });
  const missing = Object.keys(rest).filter((name) => !driven.has(nodeName(name)));
  if (missing.length > 0)
    throw new Error(`${BODY_MODEL_URL}: bones not found: ${missing.join(', ')}`);
  // Bones left out of the rest frames (none today) keep the rest pose.
  const identity = new Matrix4();
  skin.skeleton.bones.forEach((_bone, index) => {
    writeBone(texture.image.data as Float32Array, index, identity, identity);
  });
  return { root, driven, material, texture, meshToWorld, worldToMesh };
}

export function BodyMesh({ fighter, ref, translucent = false, initialPose, onReady }: Props) {
  const gltf = useGLTF(BODY_MODEL_URL, false); // no Draco: its decoder comes from a CDN
  const rest = gltf.scene.userData.tatamapRest as Rest | undefined;
  if (!rest) throw new Error(`${BODY_MODEL_URL}: no rest frames (tatamapRest)`);
  const body = useMemo(
    () => buildBody(gltf.scene, rest, FIGHTER_COLORS[fighter], translucent),
    [gltf.scene, rest, fighter, translucent],
  );
  useLayoutEffect(
    () => () => {
      body.material.dispose();
      body.texture.dispose();
    },
    [body],
  );

  const prevRef = useRef<{ state: RigState; at: number } | null>(null);
  const scratch = useMemo(() => ({ rigid: new Matrix4(), stretch: new Matrix4() }), []);

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
        const data = body.texture.image.data as Float32Array;
        const { rigid, stretch } = scratch;
        for (const [name, frame] of bones) {
          const d = body.driven.get(nodeName(name));
          if (!d) continue;
          // frame(now) * stretch * frame(rest)^-1 = rigid * (frame(rest) * stretch * frame(rest)^-1)
          frameMatrix(frame, 1, rigid).multiply(d.restInverse);
          stretch.makeScale(1, frame.head.distanceTo(frame.tail) / d.length, 1);
          stretch.premultiply(d.rest).multiply(d.restInverse);
          // Into the mesh's space: M^-1 * T * M.
          rigid.premultiply(body.worldToMesh).multiply(body.meshToWorld);
          stretch.premultiply(body.worldToMesh).multiply(body.meshToWorld);
          writeBone(data, d.index, rigid, stretch);
        }
        body.texture.needsUpdate = true;
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
