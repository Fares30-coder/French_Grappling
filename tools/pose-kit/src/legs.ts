import {
  type CurrentFighterPose,
  type CurrentPose,
  FIGHTERS,
  STANDARD_BODY_V2_21,
  type Vec3,
} from '@tatamap/shared';
import { twoBoneIk } from './ik';
import { add, cross, distance, dot, length, scale, sub, unit } from './vec';

/** A thigh within this fraction of the standard length is left as it is. */
export const THIGH_TOLERANCE = 0.05;
/** A shin within this fraction of the standard length keeps its own length. */
const SHIN_TOLERANCE = 0.12;

/** A knee sphere is 5 cm: its centre stays at least this high (or as high as it was). */
const KNEE_FLOOR_CM = 5;

/**
 * Turns `knee` around the line hip -> ankle by the smallest angle that keeps it at least `floor`
 * high (a kneeling leg: IK may put the knee under the mat). Same lengths. The highest point of
 * the circle if none is high enough.
 */
function kneeAboveMat(hip: Vec3, foot: Vec3, knee: Vec3, floor: number): Vec3 {
  if (knee[1] >= floor) return knee;
  const axis = unit(sub(foot, hip));
  const centre = add(hip, scale(axis, dot(sub(knee, hip), axis)));
  const r = sub(knee, centre);
  const radius = length(r);
  if (radius < 1e-6) return knee;
  const u = scale(r, 1 / radius);
  const w = cross(axis, u);
  let best = knee;
  for (let k = 1; k <= 180; k++) {
    for (const sign of [1, -1]) {
      const a = (sign * k * Math.PI) / 180;
      const p = add(centre, add(scale(u, radius * Math.cos(a)), scale(w, radius * Math.sin(a))));
      if (p[1] >= floor) return p;
      if (p[1] > best[1]) best = p;
    }
  }
  return best;
}

const round1 = (v: Vec3): Vec3 => [
  Math.round(v[0] * 10) / 10,
  Math.round(v[1] * 10) / 10,
  Math.round(v[2] * 10) / 10,
];

export type LegFix = {
  side: 'L' | 'R';
  thighBefore: number;
  kneeMovedCm: number;
  footMovedCm: number;
};

/**
 * Brings each thigh (hip joint -> knee) back to the standard length when it is off by more than
 * THIGH_TOLERANCE: the knee is placed again by 2-bone IK from the hip joint to the ankle, bending
 * the way it bent, turned up if that would put it under the mat. The ankle stays (moved, with the toes, only if it is out of reach of the
 * straight leg). The shin keeps its length unless it too is off the standard. Pure.
 */
export function fixThighs(f: CurrentFighterPose): { fighter: CurrentFighterPose; fixes: LegFix[] } {
  const out: CurrentFighterPose = { ...f };
  const fixes: LegFix[] = [];
  for (const s of ['L', 'R'] as const) {
    const hip = f[`hip${s}`];
    const knee = f[`knee${s}`];
    const foot = f[`foot${s}`];
    const thighStd = STANDARD_BODY_V2_21[`hip${s}-knee${s}` as 'hipL-kneeL'];
    const shinStd = STANDARD_BODY_V2_21[`knee${s}-foot${s}` as 'kneeL-footL'];
    const thigh = distance(hip, knee);
    if (Math.abs(thigh - thighStd) / thighStd <= THIGH_TOLERANCE) continue;
    const shinNow = distance(knee, foot);
    const shin = Math.abs(shinNow - shinStd) / shinStd <= SHIN_TOLERANCE ? shinNow : shinStd;
    // The knee bends where it bent: away from the hip -> ankle line.
    const mid = scale(add(hip, foot), 0.5);
    const pole = sub(knee, mid);
    const ik = twoBoneIk(hip, foot, thighStd, shin, pole);
    const footMove = sub(ik.end, foot);
    const floor = Math.min(knee[1], KNEE_FLOOR_CM);
    const newKnee = kneeAboveMat(hip, ik.end, ik.mid, floor);
    out[`knee${s}`] = round1([newKnee[0], Math.max(0, newKnee[1]), newKnee[2]]);
    out[`foot${s}`] = round1(ik.end);
    out[`toe${s}`] = round1(add(f[`toe${s}`], footMove));
    fixes.push({
      side: s,
      thighBefore: thigh,
      kneeMovedCm: distance(newKnee, knee),
      footMovedCm: distance(ik.end, foot),
    });
  }
  return { fighter: out, fixes };
}

/** fixThighs on both fighters of a pose. */
export function fixPoseThighs(pose: CurrentPose): {
  pose: CurrentPose;
  fixes: Array<LegFix & { fighter: (typeof FIGHTERS)[number] }>;
} {
  const fixes: Array<LegFix & { fighter: (typeof FIGHTERS)[number] }> = [];
  const fighters = { ...pose.fighters };
  for (const id of FIGHTERS) {
    const r = fixThighs(pose.fighters[id]);
    fighters[id] = r.fighter;
    for (const x of r.fixes) fixes.push({ ...x, fighter: id });
  }
  return { pose: { ...pose, fighters }, fixes };
}
