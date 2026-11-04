import {
  boneKey,
  CURRENT_BONES,
  CURRENT_JOINTS,
  type CurrentFighterPose,
  type CurrentJoint,
  type CurrentPose,
  FIGHTERS,
  type FighterId,
  HEAD_RADIUS_CM,
  type Vec3,
} from '@tatamap/shared';
import { add, dot, length, scale, sub } from './vec';

/** Radius of the joint spheres in the viewer (FighterMesh.tsx). */
export const JOINT_RADIUS_CM = 5;

/** Tips that only point a part: they may touch the mat (a toe, fingers posted flat). */
const isTip = (joint: CurrentJoint): boolean =>
  joint === 'nose' || joint.startsWith('handTip') || joint.startsWith('toe');

/**
 * Joints that sink into the mat (y = 0): a joint is a sphere (radius JOINT_RADIUS_CM, the head
 * HEAD_RADIUS_CM), so a centre lower than that minus `toleranceCm` is partly hidden by the mat,
 * which shows as clipped hands and feet in the viewer. Rest joints at y >= 6. Tips (nose,
 * fingertips, toes) may rest on the mat.
 */
export function jointsBelowMat(
  pose: CurrentPose,
  toleranceCm = 1,
): Array<{ fighter: FighterId; joint: CurrentJoint; y: number }> {
  const out: Array<{ fighter: FighterId; joint: CurrentJoint; y: number }> = [];
  for (const fighter of FIGHTERS) {
    for (const joint of CURRENT_JOINTS) {
      if (isTip(joint)) continue;
      const y = pose.fighters[fighter][joint][1];
      const floor = (joint === 'head' ? HEAD_RADIUS_CM : JOINT_RADIUS_CM) - toleranceCm;
      if (y < floor) out.push({ fighter, joint, y });
    }
  }
  return out;
}

/**
 * Closest points of segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection): p at
 * parameter s on the first, q at t on the second.
 */
export function closestPoints(
  p1: Vec3,
  q1: Vec3,
  p2: Vec3,
  q2: Vec3,
): { s: number; t: number; p: Vec3; q: Vec3 } {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  let s: number;
  let t: number;
  if (a < 1e-9 && e < 1e-9) return { s: 0, t: 0, p: p1, q: p2 };
  if (a < 1e-9) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e < 1e-9) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return { s, t, p: add(p1, scale(d1, s)), q: add(p2, scale(d2, t)) };
}

/** Shortest distance between segments p1-q1 and p2-q2. */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const { p, q } = closestPoints(p1, q1, p2, q2);
  return length(sub(p, q));
}

export type Contact = {
  /** Human-readable pair, e.g. "me hip-kneeL x opponent neck-hip". */
  between: string;
  /** Distance between the two skeleton segments, in cm. */
  distanceCm: number;
  /** The distance below which this pair is reported. */
  thresholdCm: number;
  kind: 'limbs' | 'torso' | 'head';
};

/** Two limb segments closer than this cross (a limb is ~10 cm thick; touching is fine). */
export const LIMB_CONTACT_CM = 6;
/** A limb passing this close to the other fighter's spine line (pelvis-chest-neck) goes through the chest or belly. */
export const TORSO_CONTACT_CM = 8;
/** A limb passing this close to the other fighter's head centre goes through the head (radius 13). */
export const HEAD_CONTACT_CM = 8;

type Segment = { name: string; a: Vec3; b: Vec3; torso: boolean };

function segmentsOf(fighter: CurrentFighterPose): Segment[] {
  return CURRENT_BONES.map(([from, to]) => ({
    name: boneKey(from, to),
    a: fighter[from],
    b: fighter[to],
    // The spine (pelvis -> chest -> neck) stands for the torso.
    torso: (from === 'pelvis' && to === 'chest') || (from === 'chest' && to === 'neck'),
  }));
}

/**
 * Rough interpenetration check between the two fighters, on the bare skeleton (no flesh):
 * - limb vs limb closer than LIMB_CONTACT_CM,
 * - any segment vs the other's spine (pelvis-chest, chest-neck) closer than TORSO_CONTACT_CM,
 * - any segment vs the other's head centre closer than HEAD_CONTACT_CM.
 * APPROXIMATE: grips on the collar or a leg wrapped around the waist are legitimate and may be
 * flagged; real overlaps deeper than a few cm are what this is for. Alerts, never errors.
 */
export function findContacts(pose: CurrentPose): Contact[] {
  const me = segmentsOf(pose.fighters.me);
  const opp = segmentsOf(pose.fighters.opponent);
  const contacts: Contact[] = [];
  for (const a of me) {
    for (const b of opp) {
      const between = `me ${a.name} x opponent ${b.name}`;
      const d = segmentDistance(a.a, a.b, b.a, b.b);
      const torso = a.torso || b.torso;
      const threshold = torso ? TORSO_CONTACT_CM : LIMB_CONTACT_CM;
      if (d < threshold) {
        contacts.push({
          between,
          distanceCm: d,
          thresholdCm: threshold,
          kind: torso ? 'torso' : 'limbs',
        });
      }
    }
  }
  const heads: Array<[string, Vec3, string, Segment[]]> = [
    ['me', pose.fighters.me.head, 'opponent', opp],
    ['opponent', pose.fighters.opponent.head, 'me', me],
  ];
  for (const [owner, head, otherName, others] of heads) {
    for (const seg of others) {
      const d = segmentDistance(seg.a, seg.b, head, head);
      if (d < HEAD_CONTACT_CM) {
        contacts.push({
          between: `${otherName} ${seg.name} x ${owner} head`,
          distanceCm: d,
          thresholdCm: HEAD_CONTACT_CM,
          kind: 'head',
        });
      }
    }
  }
  return contacts.sort((x, y) => x.distanceCm - y.distanceCm);
}

/** Bounding box centre of all joints of both fighters (to aim axis-aligned cameras). */
export function poseCenter(pose: CurrentPose): Vec3 {
  const points = FIGHTERS.flatMap((f) => CURRENT_JOINTS.map((j) => pose.fighters[f][j]));
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i] ?? 0, p[i] ?? 0);
      max[i] = Math.max(max[i] ?? 0, p[i] ?? 0);
    }
  }
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

/** A head bent further than this from the spine line (pelvis -> neck) is past what a neck does. */
export const MAX_HEAD_BEND_DEG = 60;

/** Fighters whose head is bent more than MAX_HEAD_BEND_DEG from their spine line. */
export function bentNecks(pose: CurrentPose): Array<{ fighter: FighterId; degrees: number }> {
  const out: Array<{ fighter: FighterId; degrees: number }> = [];
  for (const fighter of FIGHTERS) {
    const f = pose.fighters[fighter];
    const spine = sub(f.neck, f.pelvis);
    const head = sub(f.head, f.neck);
    const cos = dot(spine, head) / (length(spine) * length(head) || 1);
    const degrees = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
    if (degrees > MAX_HEAD_BEND_DEG) out.push({ fighter, degrees });
  }
  return out;
}
