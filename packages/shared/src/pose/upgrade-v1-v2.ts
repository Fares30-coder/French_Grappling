import type { FighterPoseV1_11, PoseV1_11, Vec3 } from './skeleton-v1-11';
import { type FighterPoseV2_21, type PoseV2_21, SKELETON_V2_21 } from './skeleton-v2-21';
import { add, cross, dot, length, scale, sub, unit } from './vec';

/**
 * v1-11 -> v2-21 (ADR 0004, step 2). The new points are the ones the humanoid model already
 * derived from a v1-11 pose (apps/web/src/features/viewer/rig.ts `derivedPoints`, and
 * tools/blender/tatamap_humanoid.py for the videos), so an upgraded pose looks exactly the same:
 * - up = hip -> neck; forward = the thighs across the spine (the x axis if they run along it);
 *   left = up x forward;
 * - chest 34 cm up the spine, nose 11 cm in front of the head centre;
 * - shoulders at neck +/- 17 cm sideways and 5 cm down, moved like a shoulder blade so the upper
 *   arm stays 27-34 cm long; hip joints at hip +/- 9 cm sideways and 5 cm down;
 * - fingertips 8 cm past the middle of the hand; toes 15 cm from the ankle, like the kneecap;
 *   both tilted up to rest on the mat rather than go through it (the model put them under).
 * Kept as they are: head, neck, elbows, hands, knees, feet; `pelvis` = `hip`; camera and hands.
 * Pure. Every point is kept above the mat (y >= 0).
 */

const CHEST_CM = 34;
const NOSE_CM = 11;
const SHOULDER_SIDE_CM = 17;
const SHOULDER_DROP_CM = 5;
const UPPER_ARM_CM = [27, 34] as const;
const SHOULDER_SHIFT_CM = 10;
const HIP_SIDE_CM = 9;
const HIP_DROP_CM = 5;
const FINGERS_CM = 8;
const TOE_CM = 15;
/** Below this, the thighs run along the spine and give no forward (cm). */
const MIN_FORWARD_CM = 3;

function bodyFrame(f: FighterPoseV1_11): { up: Vec3; forward: Vec3; left: Vec3 } {
  const up = unit(sub(f.neck, f.hip));
  const thighs = sub(add(f.kneeL, f.kneeR), scale(f.hip, 2));
  let forward = sub(thighs, scale(up, dot(thighs, up)));
  if (length(forward) < MIN_FORWARD_CM) forward = sub([1, 0, 0], scale(up, up[0]));
  forward = unit(forward);
  const left = unit(cross(up, forward));
  return { up, forward: unit(cross(left, up)), left };
}

/** Where a mid joint (knee) points; `straight` when the limb is straight. */
function bendDir(root: Vec3, mid: Vec3, end: Vec3, straight: Vec3, fadeCm = 6): Vec3 {
  const off = sub(mid, scale(add(root, end), 0.5));
  const w = Math.min(1, length(off) / fadeCm);
  const d = add(scale(length(off) > 1e-6 ? unit(off) : straight, w), scale(straight, 1 - w));
  return length(d) > 1e-6 ? unit(d) : straight;
}

/** Shoulder point, moved like a shoulder blade so the upper arm is never crushed or overlong. */
function shoulder(nominal: Vec3, elbow: Vec3, forward: Vec3, up: Vec3): Vec3 {
  const near = Math.min(1, length(sub(elbow, nominal)) / 8);
  const reach = scale(unit(sub(elbow, nominal)), near);
  const s = add(
    nominal,
    scale(
      add(scale(forward, Math.max(0, dot(reach, forward))), scale(up, Math.max(0, dot(reach, up)))),
      3,
    ),
  );
  const d = length(sub(elbow, s));
  const [lo, hi] = UPPER_ARM_CM;
  let shift = Math.min(d - lo, 0) + Math.max(d - hi, 0);
  shift = Math.max(-SHOULDER_SHIFT_CM, Math.min(SHOULDER_SHIFT_CM, shift)) * Math.min(1, d / 8);
  return add(s, scale(unit(sub(elbow, s)), shift));
}

const aboveMat = ([x, y, z]: Vec3): Vec3 => [x, Math.max(0, y), z];

/**
 * A tip's direction (toes, fingers), tilted up just enough for a tip `cm` away from `base` to
 * rest on the mat instead of going through it (a kneeling fighter's foot pointing down, a hand
 * posted with the fingers down). Same length.
 */
function onTheMat(base: Vec3, dir: Vec3, cm: number, forward: Vec3): Vec3 {
  if (base[1] + dir[1] * cm >= 0) return dir;
  const y = Math.max(-1, -base[1] / cm);
  let flat: Vec3 = [dir[0], 0, dir[2]];
  if (length(flat) < 1e-6) flat = [forward[0], 0, forward[2]];
  if (length(flat) < 1e-6) flat = [1, 0, 0];
  return add(scale(unit(flat), Math.sqrt(1 - y * y)), [0, y, 0]);
}

export function upgradeFighterV1toV2(f: FighterPoseV1_11): FighterPoseV2_21 {
  const { up, forward, left } = bodyFrame(f);
  const side = (s: 'L' | 'R') => {
    const sign = s === 'L' ? 1 : -1;
    const elbow = f[`elbow${s}`];
    const hand = f[`hand${s}`];
    const knee = f[`knee${s}`];
    const foot = f[`foot${s}`];
    const nominal = sub(
      add(f.neck, scale(left, SHOULDER_SIDE_CM * sign)),
      scale(up, SHOULDER_DROP_CM),
    );
    const hip = sub(add(f.hip, scale(left, HIP_SIDE_CM * sign)), scale(up, HIP_DROP_CM));
    const kneeDir = bendDir(hip, knee, foot, forward);
    const shin = unit(sub(foot, knee));
    const footFlat = sub(kneeDir, scale(shin, dot(kneeDir, shin)));
    const footDir = length(footFlat) > 1e-3 ? unit(footFlat) : forward;
    return {
      shoulder: shoulder(nominal, elbow, forward, up),
      handTip: add(
        hand,
        scale(onTheMat(hand, unit(sub(hand, elbow)), FINGERS_CM, forward), FINGERS_CM),
      ),
      hip,
      toe: add(foot, scale(onTheMat(foot, footDir, TOE_CM, forward), TOE_CM)),
    };
  };
  const l = side('L');
  const r = side('R');
  const out: FighterPoseV2_21 = {
    head: f.head,
    nose: add(f.head, scale(forward, NOSE_CM)),
    neck: f.neck,
    chest: add(f.hip, scale(up, CHEST_CM)),
    pelvis: f.hip,
    shoulderL: l.shoulder,
    shoulderR: r.shoulder,
    elbowL: f.elbowL,
    elbowR: f.elbowR,
    handL: f.handL,
    handR: f.handR,
    handTipL: l.handTip,
    handTipR: r.handTip,
    hipL: l.hip,
    hipR: r.hip,
    kneeL: f.kneeL,
    kneeR: f.kneeR,
    footL: f.footL,
    footR: f.footR,
    toeL: l.toe,
    toeR: r.toe,
  };
  for (const key of Object.keys(out) as Array<keyof FighterPoseV2_21>) {
    out[key] = aboveMat(out[key]);
  }
  return out;
}

export function upgradeV1toV2(pose: PoseV1_11): PoseV2_21 {
  return {
    skeleton: SKELETON_V2_21,
    fighters: {
      me: upgradeFighterV1toV2(pose.fighters.me),
      opponent: upgradeFighterV1toV2(pose.fighters.opponent),
    },
    ...(pose.camera ? { camera: pose.camera } : {}),
    ...(pose.hands ? { hands: pose.hands } : {}),
  };
}
