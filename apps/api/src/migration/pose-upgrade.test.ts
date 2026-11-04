import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CURRENT_SKELETON, currentPoseSchema, poseV1_11Schema } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../db';
import { migratePoses, upgradeContentFiles, upgradeStoredPose } from './pose-upgrade';

// A v1-11 pose as stored before v2-21 (the scissor sweep, step 1).
const v1 = poseV1_11Schema.parse({
  skeleton: 'v1-11',
  fighters: {
    me: {
      head: [-150, 24, 0],
      neck: [-125, 21, 0],
      hip: [-30, 18, 0],
      elbowL: [-85, 56, 16],
      handL: [-10, 91, 16],
      elbowR: [-80, 48, -16],
      handR: [-15, 76, -16],
      kneeL: [20, 56, 16],
      footL: [52, 44, 16],
      kneeR: [15, 50, -16],
      footR: [45, 34, -16],
    },
    opponent: {
      head: [22, 156, 0],
      neck: [25, 131, 0],
      hip: [32, 66, 0],
      elbowL: [2, 96, 16],
      handL: [-22, 48, 16],
      elbowR: [8, 91, -16],
      handR: [-15, 44, -16],
      kneeL: [-10, 11, 16],
      footL: [72, 8, 16],
      kneeR: [-5, 14, -16],
      footR: [76, 10, -16],
    },
  },
});

describe('upgradeStoredPose', () => {
  it('gives a current pose rounded to 0.1 cm, and leaves a current one as it is', () => {
    const up = upgradeStoredPose(v1);
    expect(up.skeleton).toBe(CURRENT_SKELETON);
    expect(currentPoseSchema.safeParse(up).success).toBe(true);
    for (const f of Object.values(up.fighters)) {
      for (const p of Object.values(f)) for (const c of p) expect(Math.round(c * 10) / 10).toBe(c);
    }
    expect(upgradeStoredPose(up)).toEqual(up);
  });
});

describe('upgradeContentFiles', () => {
  it('rewrites the old poses only, keeps the rest, and is idempotent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tatamap-upgrade-'));
    try {
      const technique = {
        slug: 'test-upgrade',
        name: 'Test',
        category: 'sweep',
        level: 'beginner',
        gi: 'both',
        status: 'draft',
        publishedAt: null,
        startPosition: 'garde-fermee',
        endPosition: 'montee',
        keyPoints: [],
        commonMistakes: [],
        tags: [],
        steps: [{ title: 'Départ', text: '', transitionMs: 1300, pose: v1 }],
        chains: [],
      };
      await import('node:fs/promises').then((fs) => fs.mkdir(join(dir, 'techniques')));
      const file = join(dir, 'techniques', 'test-upgrade.json');
      await writeFile(file, JSON.stringify(technique, null, 2));
      expect(await upgradeContentFiles(dir)).toEqual({ files: ['test-upgrade.json'], steps: 1 });
      const after = JSON.parse(await readFile(file, 'utf8'));
      expect(after.steps[0].pose.skeleton).toBe(CURRENT_SKELETON);
      expect(Object.keys(after)).toEqual(Object.keys(technique));
      expect(await upgradeContentFiles(dir)).toEqual({ files: [], steps: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// Integration: needs a migrated and seeded database (pnpm db:seed).
const prisma = createPrisma(process.env.DATABASE_URL ?? '');
afterAll(async () => {
  await prisma.$disconnect();
});

describe('migratePoses', () => {
  it('upgrades the steps stored in an older skeleton, once', async () => {
    const start = await prisma.position.findUniqueOrThrow({ where: { slug: 'garde-fermee' } });
    const t = await prisma.technique.create({
      data: {
        slug: 'migration-test',
        name: 'Migration de test',
        category: 'submission',
        level: 'beginner',
        gi: 'both',
        status: 'draft',
        startPositionId: start.id,
        steps: { create: { order: 1, title: 'Étape', skeleton: 'v1-11', pose: v1 } },
      },
      include: { steps: true },
    });
    try {
      expect(await migratePoses(prisma)).toBeGreaterThanOrEqual(1);
      const step = await prisma.step.findUniqueOrThrow({ where: { id: t.steps[0]?.id ?? '' } });
      expect(step.skeleton).toBe(CURRENT_SKELETON);
      expect(currentPoseSchema.parse(step.pose).skeleton).toBe(CURRENT_SKELETON);
      expect(await migratePoses(prisma)).toBe(0);
    } finally {
      await prisma.technique.delete({ where: { id: t.id } });
    }
  });
});
