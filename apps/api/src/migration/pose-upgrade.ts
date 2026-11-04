import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CURRENT_SKELETON,
  type CurrentPose,
  contentTechniqueSchema,
  currentPoseSchema,
  poseSchema,
  upgradePose,
  type Vec3,
} from '@tatamap/shared';
import type { PrismaClient } from '../generated/prisma/client';

/**
 * Bringing stored poses to the current skeleton (ADR 0002 D6.6, ADR 0004): content files and
 * database rows. Both idempotent: a pose already current is left as it is.
 */

const round1 = (p: Vec3): Vec3 => [
  Math.round(p[0] * 10) / 10,
  Math.round(p[1] * 10) / 10,
  Math.round(p[2] * 10) / 10,
];

/** Any stored pose in the current skeleton, points rounded to 0.1 cm (readable files). */
export function upgradeStoredPose(raw: unknown): CurrentPose {
  const pose = upgradePose(poseSchema.parse(raw));
  const fighters = Object.fromEntries(
    Object.entries(pose.fighters).map(([id, f]) => [
      id,
      Object.fromEntries(Object.entries(f).map(([joint, p]) => [joint, round1(p)])),
    ]),
  );
  return currentPoseSchema.parse({ ...pose, fighters });
}

const isCurrent = (pose: unknown): boolean =>
  typeof pose === 'object' &&
  pose !== null &&
  'skeleton' in pose &&
  pose.skeleton === CURRENT_SKELETON;

/** 2-space indent and a final newline, as content:export writes. */
const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Rewrites the technique files of `dir` whose steps hold older poses; only the poses change, the
 * rest of each file (and its key order) is kept. Every file is checked first: if one is invalid
 * nothing is written. Returns the files rewritten and the steps upgraded.
 */
export async function upgradeContentFiles(
  dir: string,
): Promise<{ files: string[]; steps: number }> {
  const techniquesDir = join(dir, 'techniques');
  const names = (await readdir(techniquesDir)).filter((n) => n.endsWith('.json')).sort();
  const changed: Array<[string, unknown]> = [];
  let steps = 0;
  const problems: string[] = [];
  for (const name of names) {
    const raw = JSON.parse(await readFile(join(techniquesDir, name), 'utf8')) as {
      steps?: Array<{ pose?: unknown }>;
    };
    let count = 0;
    for (const step of raw.steps ?? []) {
      if (isCurrent(step.pose)) continue;
      step.pose = upgradeStoredPose(step.pose);
      count++;
    }
    const check = contentTechniqueSchema.safeParse(raw);
    if (!check.success) problems.push(`${name}: ${check.error.issues[0]?.message ?? 'invalid'}`);
    else if (count > 0) {
      changed.push([name, raw]);
      steps += count;
    }
  }
  if (problems.length)
    throw new Error(`Invalid content, nothing written:\n  ${problems.join('\n  ')}`);
  for (const [name, raw] of changed) await writeFile(join(techniquesDir, name), toJson(raw));
  return { files: changed.map(([name]) => name), steps };
}

/**
 * Upgrades the steps of the database whose `skeleton` is not the current one, in one
 * transaction (`skeleton` mirrors `pose.skeleton`, ADR 0002 D6.1). Returns how many.
 */
export async function migratePoses(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.step.findMany({
    where: { skeleton: { not: CURRENT_SKELETON } },
    select: { id: true, pose: true },
  });
  await prisma.$transaction(
    rows.map((row) => {
      const pose = upgradeStoredPose(row.pose);
      return prisma.step.update({
        where: { id: row.id },
        data: { pose, skeleton: pose.skeleton },
      });
    }),
  );
  return rows.length;
}
