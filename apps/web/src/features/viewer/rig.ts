import type { CurrentFighterPose, CurrentJoint, HandState, ThumbHint, Vec3 } from '@tatamap/shared';
import { Quaternion, Vector3 } from 'three';

/**
 * Bone frames of the humanoid model from a v2-21 fighter (ADR 0004). A port of `derived_points`
 * and `bone_frames` in tools/blender/tatamap_humanoid.py, which renders the videos with the same
 * model: same points, same rolls, same hands. Kept in step with it by rig.test.ts, against frames
 * computed by Blender (tools/blender/rig_fixture.py).
 *
 * Shoulders, hip joints, chest, fingertips, toes and nose are data in v2-21 (`upgradePose` put
 * them where step 1 of ADR 0004 used to derive them from v1-11). Still derived: up = pelvis ->
 * neck, left = across the hip joints, forward = left x up; the waist, the collarbone and the
 * wrist; limbs twisted towards the elbow and knee points. Pure; three's maths only.
 */

/** A bone at a moment: head and tail points and its z axis (roll), Tatamap cm. */
export type BoneFrame = { head: Vector3; tail: Vector3; z: Vector3 };
export type BoneFrames = Map<string, BoneFrame>;

/** What one frame passes to the next: facing, rolls and hand shapes turn at a bounded speed. */
export type RigState = {
  fwd: Vector3;
  z: Map<string, Vector3>;
  hand: { L: number; R: number };
};

/**
 * Fastest turn of the derived facing and rolls (the videos: 60 degrees a frame at 30 fps). It
 * only smooths pops: at 450 a limb moving at a normal speed lagged behind its pose, twisted, for
 * dozens of frames (up to 177 degrees behind).
 */
export const MAX_TURN_DEG_PER_S = 1800;
/** Fastest change of a hand shape (-1 flat .. 1 fist; the videos: 0.12 a frame at 30 fps). */
export const GRIP_SPEED_PER_S = 3.6;

const DEG = Math.PI / 180;
const v = (p: Vec3) => new Vector3(p[0], p[1], p[2]);
const unit = (a: Vector3) => a.clone().normalize();

/** A vector perpendicular to `a` (mathutils' Vector.orthogonal, for the same results). */
function orthogonal(a: Vector3): Vector3 {
  const [ax, ay, az] = [Math.abs(a.x), Math.abs(a.y), Math.abs(a.z)];
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  if (axis === 0) return new Vector3(-a.y - a.z, a.x, a.x);
  if (axis === 1) return new Vector3(a.y, -a.x - a.z, a.y);
  return new Vector3(a.z, a.z, -a.x - a.y);
}

/** Unit vector b, or a turned towards b by at most maxDeg. */
function turnTowards(a: Vector3, b: Vector3, maxDeg: number): Vector3 {
  if (a.angleTo(b) <= maxDeg * DEG) return b.clone();
  let axis = a.clone().cross(b);
  if (axis.length() < 1e-6) axis = orthogonal(a);
  return a.clone().applyAxisAngle(axis.normalize(), maxDeg * DEG);
}

/**
 * Orthonormal body frame of a fighter; `prevForward` limits how far the facing turns. Forward is
 * square to the line across the hip joints; if they sit on the spine, the thighs give it.
 */
function bodyFrame(f: CurrentFighterPose, prevForward: Vector3 | null, maxDeg: number) {
  const hip = v(f.pelvis);
  const up = unit(v(f.neck).sub(hip));
  const across = v(f.hipL).sub(v(f.hipR));
  across.sub(up.clone().multiplyScalar(across.dot(up)));
  let fwd: Vector3;
  if (across.length() > 3) {
    fwd = across.clone().cross(up);
  } else {
    const thighs = v(f.kneeL).add(v(f.kneeR)).sub(hip.clone().multiplyScalar(2));
    fwd = thighs.clone().sub(up.clone().multiplyScalar(thighs.dot(up)));
    if (fwd.length() < 3) {
      fwd = prevForward ? prevForward.clone() : new Vector3(1, 0, 0);
      fwd.sub(up.clone().multiplyScalar(fwd.dot(up)));
    }
  }
  fwd.normalize();
  if (prevForward) {
    const before = prevForward.clone().sub(up.clone().multiplyScalar(prevForward.dot(up)));
    if (before.length() > 1e-3) fwd = turnTowards(before.normalize(), fwd, maxDeg);
  }
  const left = up.clone().cross(fwd).normalize();
  return { up, fwd: left.clone().cross(up).normalize(), left };
}

/** Where a mid joint (elbow, knee) points; `straight` when the limb is straight. */
function bendDir(root: Vector3, mid: Vector3, end: Vector3, straight: Vector3, fadeCm = 6) {
  const off = mid.clone().sub(root.clone().add(end).multiplyScalar(0.5));
  const w = Math.min(1, off.length() / fadeCm);
  const d = (off.length() > 1e-6 ? unit(off) : straight.clone())
    .multiplyScalar(w)
    .add(straight.clone().multiplyScalar(1 - w));
  return d.length() > 1e-6 ? d.normalize() : straight.clone();
}

const DELTOID_CM = 8;

/**
 * No-twist references, in the torso frame (left, up, forward): [limb direction, roll there].
 * Arms swing from hanging down, elbow behind: raising one forward or out to the side does not
 * twist it (from "pointing forward", an arm out to the side counted as a 90 degree twist and the
 * skin wrung the upper arm). Legs swing from pointing forward, the knee up (sitting).
 */
const ARM_SWING_REST = [new Vector3(0, -1, 0), new Vector3(0, 0, 1)] as const;
const LEG_SWING_REST = [new Vector3(0, 0, 1), new Vector3(0, 1, 0)] as const;

/** Roll of a limb's top half that only swings from its rest direction, with no twist. */
function swingRef(
  direction: Vector3,
  up: Vector3,
  fwd: Vector3,
  left: Vector3,
  [restDirection, restRoll]: readonly [Vector3, Vector3],
): Vector3 {
  const local = new Vector3(direction.dot(left), direction.dot(up), direction.dot(fwd)).normalize();
  const turn = new Quaternion().setFromUnitVectors(restDirection, local);
  const z = restRoll.clone().applyQuaternion(turn);
  return left
    .clone()
    .multiplyScalar(z.x)
    .add(up.clone().multiplyScalar(z.y))
    .add(fwd.clone().multiplyScalar(z.z));
}

/**
 * Turn (rad) about the forearm `axis` from the automatic thumb direction to the hint's, scaled by
 * the hint's weight; 0 without a hint or when either direction runs along the forearm.
 */
function thumbTurn(auto: Vector3, axis: Vector3, hint: ThumbHint | undefined): number {
  if (!hint || hint.weight <= 0) return 0;
  const flat = (d: Vector3) => d.clone().sub(axis.clone().multiplyScalar(d.dot(axis)));
  const from = flat(auto);
  const to = flat(v(hint.dir));
  if (from.length() < 1e-3 || to.length() < 1e-3) return 0;
  return Math.atan2(axis.dot(from.clone().cross(to)), from.dot(to)) * Math.min(1, hint.weight);
}

type Points = Record<string, Vector3>;
type Refs = Record<string, Vector3>;

/** Humanoid points (cm) and roll references of a fighter. */
export function derivedPoints(
  f: CurrentFighterPose,
  prevForward: Vector3 | null = null,
  maxTurnDeg = Infinity,
  thumbs: Partial<Record<'L' | 'R', ThumbHint>> = {},
): { q: Points; refs: Refs } {
  const { up, fwd, left } = bodyFrame(f, prevForward, maxTurnDeg);
  const hip = v(f.pelvis);
  const neck = v(f.neck);
  const head = v(f.head);
  const q: Points = {
    hip,
    waist: hip.clone().add(up.clone().multiplyScalar(16)),
    chest: v(f.chest),
    neck,
    neck_top: neck.clone().add(head.clone().sub(neck).multiplyScalar(0.4)),
    head,
    head_top: head.clone().add(unit(head.clone().sub(neck)).multiplyScalar(11)),
    clav: neck.clone().sub(up.clone().multiplyScalar(3)),
  };
  // The head faces its nose (square to the head's axis).
  const headAxis = unit(head.clone().sub(neck));
  const face = v(f.nose).sub(head);
  face.sub(headAxis.clone().multiplyScalar(face.dot(headAxis)));
  const refs: Refs = { up, fwd, left, face: face.length() > 1e-3 ? face.normalize() : fwd.clone() };
  for (const s of ['L', 'R'] as const) {
    const elbow = v(f[`elbow${s}`]);
    const hand = v(f[`hand${s}`]);
    const knee = v(f[`knee${s}`]);
    const foot = v(f[`foot${s}`]);
    const shoulderPt = v(f[`shoulder${s}`]);
    q[`shoulder${s}`] = shoulderPt;
    q[`elbow${s}`] = elbow;
    const fore = unit(hand.clone().sub(elbow));
    const wrist = hand.clone().sub(fore.clone().multiplyScalar(7));
    q[`wrist${s}`] = wrist;
    q[`finger${s}`] = v(f[`handTip${s}`]);
    const hipj = v(f[`hip${s}`]);
    q[`hipj${s}`] = hipj;
    q[`knee${s}`] = knee;
    q[`ankle${s}`] = foot;
    const kneeDir = bendDir(hipj, knee, foot, fwd);
    q[`toe${s}`] = v(f[`toe${s}`]);
    const elbowDir = bendDir(shoulderPt, elbow, wrist, fwd.clone().multiplyScalar(-1));
    refs[`elbow${s}`] = elbowDir;
    // The hand's roll follows the elbow bend unless the pose turns it: then the forearm turns
    // about its own axis (pronation, supination), half in the forearm and half in the hand.
    const turn = thumbTurn(elbowDir.clone().multiplyScalar(-1), fore, thumbs[s]);
    refs[`forearm_roll${s}`] = elbowDir.clone().applyAxisAngle(fore, turn / 2);
    refs[`thumb${s}`] = elbowDir.clone().multiplyScalar(-1).applyAxisAngle(fore, turn);
    refs[`knee${s}`] = kneeDir;
    refs[`foot_top${s}`] = knee.clone().sub(foot);
    refs[`arm_swing${s}`] = swingRef(elbow.clone().sub(shoulderPt), up, fwd, left, ARM_SWING_REST);
    refs[`leg_swing${s}`] = swingRef(knee.clone().sub(hipj), up, fwd, left, LEG_SWING_REST);
  }
  return { q, refs };
}

/** Bones driven from the derived points: name -> [head point, tail point, roll reference]. */
export const HUMANOID_BONES: ReadonlyArray<readonly [string, string, string, string]> = [
  ['pelvis', 'hip', 'waist', 'fwd'],
  ['abdomen', 'waist', 'chest', 'fwd'],
  ['chest', 'chest', 'neck', 'fwd'],
  ['neck', 'neck', 'neck_top', 'fwd'],
  ['head', 'neck_top', 'head_top', 'face'],
  ...(['L', 'R'] as const).flatMap(
    (s) =>
      [
        [`clavicle.${s}`, 'clav', `shoulder${s}`, 'fwd'],
        [`upper_arm.${s}`, `shoulder${s}`, `elbow${s}`, `arm_swing${s}`],
        [`upper_arm_twist.${s}`, `shoulder${s}`, `elbow${s}`, `elbow${s}`],
        [`forearm.${s}`, `elbow${s}`, `wrist${s}`, `forearm_roll${s}`],
        [`hand.${s}`, `wrist${s}`, `finger${s}`, `thumb${s}`],
        [`thigh.${s}`, `hipj${s}`, `knee${s}`, `leg_swing${s}`],
        [`thigh_twist.${s}`, `hipj${s}`, `knee${s}`, `knee${s}`],
        [`shin.${s}`, `knee${s}`, `ankle${s}`, `knee${s}`],
        [`foot.${s}`, `ankle${s}`, `toe${s}`, `foot_top${s}`],
      ] as const,
  ),
];

/** Unit axes (x, y, z) of a bone: y from head to tail, z towards `ref`. */
export function boneAxes(head: Vector3, tail: Vector3, ref: Vector3): [Vector3, Vector3, Vector3] {
  const y = unit(tail.clone().sub(head));
  let z = ref.clone().sub(y.clone().multiplyScalar(ref.dot(y)));
  if (z.length() < 1e-4) z = orthogonal(y); // ref along the bone: any perpendicular
  z.normalize();
  return [y.clone().cross(z).normalize(), y, z];
}

/** The deltoid: at the shoulder, its axes halfway between the clavicle's and the upper arm's. */
function deltoid(clavicle: BoneFrame, upperArm: BoneFrame): BoneFrame {
  let y = unit(clavicle.tail.clone().sub(clavicle.head)).add(
    unit(upperArm.tail.clone().sub(upperArm.head)),
  );
  y = y.length() > 1e-3 ? y.normalize() : unit(upperArm.tail.clone().sub(upperArm.head));
  return {
    head: upperArm.head.clone(),
    tail: upperArm.head.clone().add(y.multiplyScalar(DELTOID_CM)),
    z: unit(clavicle.z).add(unit(upperArm.z)),
  };
}

// --- Hands: palm-side x, along y, thumb-side z (x mirrored on the right) --------------------

/** Fingers, index to little: knuckle offset towards the thumb, length, spread (degrees). */
const FINGERS = [
  [2.75, 7.2, 5],
  [0.95, 8.0, 0],
  [-0.85, 7.5, -5],
  [-2.5, 6.0, -11],
] as const;
const FINGER_CURL = [30, 35, 22] as const;
const PHALANX = [0.45, 0.32, 0.23] as const;
const THUMB: ReadonlyArray<Vec3> = [
  [0.9, 1.6, 1.6],
  [1.8, 4.0, 3.0],
  [2.6, 6.0, 3.3],
  [3.4, 7.8, 2.8],
];
const FIST_CURL = [78, 95, 55] as const;
const THUMB_FIST: ReadonlyArray<Vec3> = [
  [0.9, 1.6, 1.6],
  [2.6, 3.8, 2.4],
  [4.0, 5.6, 1.2],
  [4.6, 7.2, -0.6],
];
const FLAT_CURL = [4, 6, 4] as const;
const THUMB_FLAT: ReadonlyArray<Vec3> = [
  [0.9, 1.6, 1.6],
  [1.1, 3.8, 3.7],
  [1.2, 5.8, 5.1],
  [1.2, 7.6, 5.9],
];
/** Hand shape of each state: -1 flat, 0 relaxed, 1 fist. */
export const HAND_SHAPES: Record<HandState, number> = { push: -1, free: 0, grip: 1 };

/** Local points of the four fingers (inside the palm, knuckle, 3 joints) and the thumb. */
function fingerPoints(shape: number): { fingers: Vector3[][]; thumb: Vector3[] } {
  const [curlTo, thumbTo] = shape >= 0 ? [FIST_CURL, THUMB_FIST] : [FLAT_CURL, THUMB_FLAT];
  const amount = Math.abs(shape);
  const palmSide = new Vector3(1, 0, 0);
  const fingers = FINGERS.map(([across, length, spread]) => {
    let d = new Vector3(0, 1, 0).applyAxisAngle(palmSide, -spread * DEG);
    let pt = new Vector3(0, 9.2, across);
    const pts = [new Vector3(0, 7.0, across), pt];
    PHALANX.forEach((frac, k) => {
      const relaxed = FINGER_CURL[k] ?? 0;
      const curl = relaxed + ((curlTo[k] ?? 0) - relaxed) * amount;
      d = d.clone().applyAxisAngle(unit(d.clone().cross(palmSide)), curl * DEG);
      pt = pt.clone().add(d.clone().multiplyScalar(length * frac));
      pts.push(pt);
    });
    return pts;
  });
  const thumb = THUMB.map((p, k) => v(p).lerp(v(thumbTo[k] ?? p), amount));
  return { fingers, thumb };
}

/** Finger and thumb bones of a hand bone, for a hand shape. */
function handBones(hand: BoneFrame, s: 'L' | 'R', sign: number, shape: number): BoneFrames {
  const [x, y, z] = boneAxes(hand.head, hand.tail, hand.z);
  const at = (p: Vector3) =>
    hand.head
      .clone()
      .add(x.clone().multiplyScalar(p.x * sign))
      .add(y.clone().multiplyScalar(p.y))
      .add(z.clone().multiplyScalar(p.z));
  const { fingers, thumb } = fingerPoints(shape);
  const bones: BoneFrames = new Map();
  fingers.forEach((pts, i) => {
    for (let k = 0; k < 3; k++) {
      bones.set(`finger${i}_${k}.${s}`, {
        head: at(pts[k + 1] as Vector3),
        tail: at(pts[k + 2] as Vector3),
        z: z.clone(),
      });
    }
  });
  for (let k = 0; k < 3; k++) {
    bones.set(`thumb_${k}.${s}`, {
      head: at(thumb[k] as Vector3),
      tail: at(thumb[k + 1] as Vector3),
      z: x.clone().multiplyScalar(sign),
    });
  }
  return bones;
}

// --- Automatic grips ------------------------------------------------------------------------

/** A hand point this close to the opponent's surface (cm) is closed, beyond `hi` relaxed. */
const GRIP_CM = [3, 10] as const;
/** The opponent's volume, as capsules: [joint, joint, radius cm]. */
const GRIP_CAPSULES: ReadonlyArray<readonly [CurrentJoint, CurrentJoint, number]> = [
  ['pelvis', 'neck', 14],
  ['neck', 'head', 6],
  ['head', 'head', 12],
  ...(['L', 'R'] as const).flatMap(
    (s) =>
      [
        ['neck', `elbow${s}`, 5],
        [`elbow${s}`, `hand${s}`, 4],
        ['pelvis', `knee${s}`, 8],
        [`knee${s}`, `foot${s}`, 5.5],
      ] as const,
  ),
];

function pointSegmentDistance(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  if (lengthSq < 1e-12) return p.distanceTo(a);
  const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / lengthSq));
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** How closed hand `s` is (0 relaxed, 1 fist): on the opponent's body, or on the other hand. */
export function gripAmount(
  f: CurrentFighterPose,
  s: 'L' | 'R',
  other?: CurrentFighterPose,
): number {
  const hand = v(f[`hand${s}`]);
  let gap = hand.distanceTo(v(f[s === 'L' ? 'handR' : 'handL'])) - 6;
  if (other) {
    for (const [a, b, r] of GRIP_CAPSULES) {
      gap = Math.min(gap, pointSegmentDistance(hand, v(other[a]), v(other[b])) - r);
    }
  }
  const [lo, hi] = GRIP_CM;
  return smoothstep(Math.min(1, Math.max(0, (hi - gap) / (hi - lo))));
}

export type BoneFramesInput = {
  /** The other fighter's joints, for automatic grips. */
  other?: CurrentFighterPose | undefined;
  /** This fighter's entry of the pose's `hands`; a hand left out is automatic. */
  hands?: Partial<Record<'L' | 'R', HandState>> | undefined;
  /** This fighter's thumb hints (pose `thumbs`, faded in transitions); a hand left out is automatic. */
  thumbs?: Partial<Record<'L' | 'R', ThumbHint>> | undefined;
  /** The previous frame's state, and the time since (s): facing, rolls and hands turn smoothly. */
  prev?: RigState | null | undefined;
  dtSeconds?: number;
};

/** Each bone's frame for a fighter, and the state to pass as `prev` to the next frame. */
export function boneFrames(
  f: CurrentFighterPose,
  { other, hands, thumbs, prev = null, dtSeconds = 1 / 30 }: BoneFramesInput = {},
): { bones: BoneFrames; state: RigState } {
  const maxTurnDeg = MAX_TURN_DEG_PER_S * dtSeconds;
  const { q, refs } = derivedPoints(f, prev?.fwd ?? null, maxTurnDeg, thumbs);
  const bones: BoneFrames = new Map();
  for (const [name, h, t, r] of HUMANOID_BONES) {
    const head = q[h] as Vector3;
    const tail = q[t] as Vector3;
    const [, y, zNow] = boneAxes(head, tail, refs[r] as Vector3);
    let z = zNow;
    const before = prev?.z.get(name);
    if (before) {
      // Turn the previous roll about the bone towards the new one.
      const flat = before.clone().sub(y.clone().multiplyScalar(before.dot(y)));
      if (flat.length() > 1e-3) {
        flat.normalize();
        const angle = Math.atan2(y.dot(flat.clone().cross(z)), flat.dot(z));
        const limit = maxTurnDeg * DEG;
        z = flat.applyAxisAngle(y, Math.max(-limit, Math.min(limit, angle)));
      }
    }
    bones.set(name, { head, tail, z });
  }
  const state: RigState = {
    fwd: refs.fwd as Vector3,
    z: new Map([...bones].map(([n, b]) => [n, b.z])),
    hand: { L: 0, R: 0 },
  };
  for (const [s, sign] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    bones.set(
      `deltoid.${s}`,
      deltoid(bones.get(`clavicle.${s}`) as BoneFrame, bones.get(`upper_arm.${s}`) as BoneFrame),
    );
    const wanted = hands?.[s];
    let shape = wanted ? HAND_SHAPES[wanted] : gripAmount(f, s, other);
    if (prev) {
      const step = GRIP_SPEED_PER_S * dtSeconds;
      shape = prev.hand[s] + Math.max(-step, Math.min(step, shape - prev.hand[s]));
    }
    state.hand[s] = shape;
    for (const [n, b] of handBones(bones.get(`hand.${s}`) as BoneFrame, s, sign, shape)) {
      bones.set(n, b);
    }
  }
  return { bones, state };
}
