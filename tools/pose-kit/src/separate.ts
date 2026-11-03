import {
  BONES_V1_11,
  type CurrentPose,
  FIGHTERS,
  type FighterId,
  HEAD_RADIUS_CM,
  JOINTS_V1_11,
  type JointV1_11,
  type Vec3,
} from '@tatamap/shared';
import { closestPoints, JOINT_RADIUS_CM } from './analyze';
import { add, distance, scale, sub, unit } from './vec';
import {
  bodyPenetrations,
  type CapsuleEnd,
  PENETRATION_TOLERANCE_CM,
  type PenetrationSide,
  poseBetween,
  TRANSITION_SAMPLES,
} from './volume';

export type SeparateOptions = {
  /** Depth left after separation (below the report tolerance, so a step ends up clean). */
  targetCm?: number;
  iterations?: number;
  /** Also separate inside the transitions (default). Off for steps that are not a sequence. */
  transitions?: boolean;
  /** No joint ends up further than this from where it was. */
  maxMoveCm?: number;
};

type Joints = Record<FighterId, Record<JointV1_11, Vec3>>;

/** Every length to keep: the drawn bones and neck -> head (the head is not a drawn bone). */
const BONES: ReadonlyArray<readonly [JointV1_11, JointV1_11]> = [...BONES_V1_11, ['neck', 'head']];

/**
 * Default cap on how far a joint moves. A limb that changes sides of another between two steps
 * (see below) would otherwise drag both steps a long way while the push goes nowhere.
 */
export const MAX_MOVE_CM = 15;

/**
 * Moves the joints of both fighters, in every step at once, until no body part sinks deeper
 * than `targetCm` into another (bodyPenetrations), at the steps and inside the transitions
 * between them. Position-based relaxation: each penetrating pair is pushed apart along the line
 * of its closest points, half on each side; a pair met inside a transition pushes the two steps
 * around it, each by its share of the transition. Then bone lengths are restored to each step's
 * own, joints are kept above the mat (no lower than they already were) and everything is pulled
 * slightly back towards the original poses. Pure; cameras and hands are kept.
 *
 * A limb that goes from one side of another to the other side between two steps cannot be fixed
 * by moving the steps: it needs a step in between, and stays reported.
 */
export function separateTechnique(
  poses: readonly CurrentPose[],
  options: SeparateOptions = {},
): CurrentPose[] {
  const target = options.targetCm ?? PENETRATION_TOLERANCE_CM - 1.5;
  const iterations = options.iterations ?? 400;
  const maxMove = options.maxMoveCm ?? MAX_MOVE_CM;
  const original = poses.map((p) => clone(p));
  const joints: Joints[] = poses.map((p) => clone(p).fighters);
  const floor = (step: number, f: FighterId, j: JointV1_11) =>
    Math.min(
      original[step]?.fighters[f][j][1] ?? 0,
      (j === 'head' ? HEAD_RADIUS_CM : JOINT_RADIUS_CM) + 1,
    );

  /** Moves a capsule end of `fighter` by `delta`, shared between steps by `shares`. */
  const moveEnd = (
    shares: ReadonlyArray<readonly [number, number]>,
    f: FighterId,
    end: CapsuleEnd,
    delta: Vec3,
  ) => {
    for (const [step, share] of shares) {
      const target = joints[step];
      if (!target) continue;
      for (const [joint, w] of end.joints) {
        target[f][joint] = add(target[f][joint], scale(delta, w * share));
      }
    }
  };
  const pushApart = (pose: CurrentPose, shares: ReadonlyArray<readonly [number, number]>) => {
    const hits = bodyPenetrations(pose, target);
    for (const hit of hits) {
      const [one, two] = hit.sides;
      let normal = pushDirection(one, two);
      if (distance(normal, [0, 0, 0]) < 1e-6) {
        normal = sub(pose.fighters[two.fighter].hip, pose.fighters[one.fighter].hip);
      }
      normal = unit(normal);
      // Half the excess each side, damped: many pairs push on the same joints at once.
      const push = (hit.depthCm - target) * 0.25;
      for (const [side, sign] of [
        [one, -1],
        [two, 1],
      ] as const) {
        const delta = scale(normal, push * sign);
        moveEnd(shares, side.fighter, side.capsule.a, scale(delta, 1 - side.t));
        moveEnd(shares, side.fighter, side.capsule.b, scale(delta, side.t));
      }
    }
    return hits.length;
  };

  for (let it = 0; it < iterations; it++) {
    const current = joints.map((fighters, i) => ({ ...poses[i], fighters }) as CurrentPose);
    let hits = 0;
    for (const [i, pose] of current.entries()) hits += pushApart(pose, [[i, 1]]);
    for (let i = 0; options.transitions !== false && i + 1 < current.length; i++) {
      const [a, b] = [current[i], current[i + 1]];
      if (!a || !b) continue;
      for (const s of TRANSITION_SAMPLES) {
        hits += pushApart(poseBetween(a, b, s), [
          [i, 1 - s],
          [i + 1, s],
        ]);
      }
    }
    if (hits === 0) break;
    for (const [step, fighters] of joints.entries()) {
      const rest = original[step];
      if (!rest) continue;
      for (let pass = 0; pass < 4; pass++) {
        for (const f of FIGHTERS) {
          for (const [a, b] of BONES) {
            const pa = fighters[f][a];
            const pb = fighters[f][b];
            const d = distance(pa, pb);
            if (d < 1e-6) continue;
            const length = distance(rest.fighters[f][a], rest.fighters[f][b]);
            const fix = scale(sub(pb, pa), (d - length) / d / 2);
            fighters[f][a] = add(pa, fix);
            fighters[f][b] = sub(pb, fix);
          }
        }
      }
      for (const f of FIGHTERS) {
        for (const j of JOINTS_V1_11) {
          const p = fighters[f][j];
          const home = rest.fighters[f][j];
          let back = add(p, scale(sub(home, p), 0.01));
          const away = distance(back, home);
          if (away > maxMove) back = add(home, scale(sub(back, home), maxMove / away));
          fighters[f][j] = [back[0], Math.max(back[1], floor(step, f, j)), back[2]];
        }
      }
    }
  }
  const round = (p: Vec3): Vec3 => [r1(p[0]), r1(p[1]), r1(p[2])];
  return joints.map((fighters, i) => ({
    ...(poses[i] as CurrentPose),
    fighters: Object.fromEntries(
      FIGHTERS.map((f) => [
        f,
        Object.fromEntries(JOINTS_V1_11.map((j) => [j, round(fighters[f][j])])),
      ]),
    ) as CurrentPose['fighters'],
  }));
}

/** One pose on its own: see separateTechnique. */
export const separateBodies = (pose: CurrentPose, options: SeparateOptions = {}): CurrentPose =>
  separateTechnique([pose], { ...options, transitions: false })[0] ?? pose;

/**
 * From side one towards side two. Against a part with a core (the torso halves), the side is
 * read from the core: a thigh between the two halves would otherwise be pushed back and forth.
 */
function pushDirection(one: PenetrationSide, two: PenetrationSide): Vec3 {
  const ends = (side: PenetrationSide) => [side.capsule.a.point, side.capsule.b.point] as const;
  if (two.capsule.core) {
    const { p, q } = closestPoints(...ends(one), ...two.capsule.core);
    return sub(q, p);
  }
  if (one.capsule.core) {
    const { p, q } = closestPoints(...one.capsule.core, ...ends(two));
    return sub(q, p);
  }
  return sub(two.point, one.point);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clone = <T>(value: T): T => structuredClone(value);
