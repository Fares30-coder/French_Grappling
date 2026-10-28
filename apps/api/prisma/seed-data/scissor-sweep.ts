import {
  currentPoseSchema,
  type FighterPoseV1_11,
  fighterPoseV1_11Schema,
  JOINTS_V1_11,
  type PoseV1_11,
} from '@tatamap/shared';

// Raw prototype data (CLAUDE.md, "Données du prototype"). 2D: SVG coordinates, y pointing down,
// floor at y = 306. Joint order: JOINTS_V1_11.
type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];

export const ME_2D: ReadonlyArray<ReadonlyArray<Point2>> = [
  [
    [150, 282],
    [175, 285],
    [270, 288],
    [215, 250],
    [290, 215],
    [220, 258],
    [285, 230],
    [320, 250],
    [352, 262],
    [315, 256],
    [345, 272],
  ],
  [
    [155, 280],
    [180, 284],
    [275, 286],
    [230, 235],
    [312, 182],
    [235, 250],
    [300, 220],
    [300, 212],
    [348, 226],
    [290, 288],
    [322, 296],
  ],
  [
    [165, 275],
    [190, 280],
    [275, 286],
    [235, 225],
    [290, 190],
    [235, 245],
    [285, 222],
    [295, 210],
    [340, 222],
    [295, 288],
    [325, 296],
  ],
  [
    [230, 240],
    [250, 255],
    [300, 285],
    [290, 225],
    [340, 205],
    [290, 240],
    [335, 225],
    [330, 200],
    [385, 185],
    [345, 285],
    [390, 292],
  ],
];

export const OPP_2D: ReadonlyArray<ReadonlyArray<Point2>> = [
  [
    [322, 150],
    [325, 175],
    [332, 240],
    [302, 210],
    [278, 258],
    [308, 215],
    [285, 262],
    [290, 295],
    [372, 298],
    [295, 292],
    [376, 296],
  ],
  [
    [318, 152],
    [322, 178],
    [332, 240],
    [300, 212],
    [282, 262],
    [305, 218],
    [288, 266],
    [292, 295],
    [372, 298],
    [298, 292],
    [376, 296],
  ],
  [
    [272, 172],
    [292, 190],
    [335, 242],
    [275, 232],
    [262, 270],
    [280, 238],
    [268, 274],
    [295, 295],
    [372, 298],
    [300, 292],
    [376, 296],
  ],
];

// Step 5 is authored directly in 3D.
export const ME_5: ReadonlyArray<Point3> = [
  [30, 130, 62],
  [30, 105, 55],
  [30, 40, 35],
  [55, 75, 75],
  [45, 30, 95],
  [5, 75, 75],
  [15, 30, 95],
  [65, 8, 35],
  [65, 6, -5],
  [-5, 8, 35],
  [-5, 6, -5],
];
export const OPP_5: ReadonlyArray<Point3> = [
  [30, 12, 140],
  [30, 14, 115],
  [30, 14, 20],
  [55, 20, 75],
  [40, 40, 45],
  [5, 20, 75],
  [20, 40, 45],
  [50, 45, -20],
  [50, 6, -55],
  [10, 45, -20],
  [10, 6, -55],
];

export const CAMERA = { position: [170, 170, 300], target: [0, 40, 20] } as const;
export const STEP4_TILT_DEG = 55;
export const STEP4_MIN_Y_CM = 6;
export const STEP4_ME_Z_OFFSET_CM = 18;

/** Rounds to 0.1 cm, normalising -0 to 0. */
const round1 = (n: number): number => Math.round(n * 10) / 10 + 0;

function toFighter(points: ReadonlyArray<Point3>): FighterPoseV1_11 {
  return fighterPoseV1_11Schema.parse(
    Object.fromEntries(JOINTS_V1_11.map((joint, i) => [joint, points[i]?.map(round1)])),
  );
}

/** 2D prototype points -> 3D: x - 300, 306 - y, z = 0 (head/neck/hip) or +16 (L) / -16 (R). */
export function convert2dTo3d(points: ReadonlyArray<Point2>): Point3[] {
  return JOINTS_V1_11.map((joint, i): Point3 => {
    const p = points[i];
    if (!p) throw new Error(`Missing joint ${joint} in 2D data`);
    const z = joint.endsWith('L') ? 16 : joint.endsWith('R') ? -16 : 0;
    return [p[0] - 300, 306 - p[1], z];
  });
}

/** Rotates around the X axis through the origin, then shifts in y so that min(y) = minY. */
export function tiltAroundX(
  points: ReadonlyArray<Point3>,
  degrees: number,
  minY: number,
): Point3[] {
  const theta = (degrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotated = points.map(([x, y, z]): Point3 => [x, y * cos - z * sin, y * sin + z * cos]);
  const shift = minY - Math.min(...rotated.map((p) => p[1]));
  return rotated.map(([x, y, z]): Point3 => [x, y + shift, z]);
}

function at<T>(list: ReadonlyArray<T>, index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`Missing data at index ${index}`);
  return item;
}

/** The 5 poses of the scissor sweep, validated against the current skeleton. */
export function buildScissorPoses(): PoseV1_11[] {
  const me3d = ME_2D.map(convert2dTo3d);
  const opp3d = OPP_2D.map(convert2dTo3d);

  const me4 = at(me3d, 3).map(([x, y, z]): Point3 => [x, y, z + STEP4_ME_Z_OFFSET_CM]);
  const opp4 = tiltAroundX(at(opp3d, 2), STEP4_TILT_DEG, STEP4_MIN_Y_CM);

  const fighters: Array<[ReadonlyArray<Point3>, ReadonlyArray<Point3>]> = [
    [at(me3d, 0), at(opp3d, 0)],
    [at(me3d, 1), at(opp3d, 1)],
    [at(me3d, 2), at(opp3d, 2)],
    [me4, opp4],
    [ME_5, OPP_5],
  ];

  return fighters.map(([me, opponent]) =>
    currentPoseSchema.parse({
      skeleton: 'v1-11',
      fighters: { me: toFighter(me), opponent: toFighter(opponent) },
      camera: { position: [...CAMERA.position], target: [...CAMERA.target] },
    }),
  );
}

export const STEP_TITLES = [
  'Garde fermée : contrôle du col et de la manche',
  'Ouvre la garde, décale les hanches, tibia en travers du ventre',
  "Tire l'adversaire vers toi pour le casser vers l'avant",
  'Ciseau : la jambe du haut pousse, celle du bas fauche',
  'Il bascule sur le côté : tu finis en montée (mount)',
] as const;

export const SEED_POSITIONS = [
  {
    slug: 'garde-fermee',
    name: 'Garde fermée',
    role: 'bottom',
    description: "Tu es sur le dos, jambes croisées autour de la taille de l'adversaire.",
  },
  {
    slug: 'montee',
    name: 'Montée',
    role: 'top',
    description: "Tu es assis sur le ventre de l'adversaire, genoux au sol.",
  },
] as const;

export const SEED_TAG = { slug: 'fondamentaux', name: 'Fondamentaux' } as const;

export const SEED_TECHNIQUE = {
  slug: 'ciseau-garde-fermee',
  name: 'Ciseau depuis la garde fermée',
  category: 'sweep',
  level: 'beginner',
  gi: 'gi',
  keyPoints: [
    "Casse la posture de l'adversaire avant de faucher.",
    'Décale les hanches pour placer le tibia en travers de son ventre.',
    'Garde le contrôle de la manche du côté où il tombe.',
  ],
  commonMistakes: [
    'Rester à plat sur le dos au lieu de se mettre sur la hanche.',
    "Faucher sans l'avoir d'abord tiré vers l'avant.",
    'Lâcher la manche : il pose la main et bloque le renversement.',
  ],
} as const;

export const STEP_TRANSITION_MS = 1300;
