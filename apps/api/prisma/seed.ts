import 'dotenv/config';
import { currentPoseSchema, DEFAULT_TRANSITION_MS } from '@tatamap/shared';
import { createPrisma } from '../src/db';
import {
  buildScissorPoses,
  SEED_POSITIONS,
  SEED_TAG,
  SEED_TECHNIQUE,
  STEP_TITLES,
} from './seed-data/scissor-sweep';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const prisma = createPrisma(databaseUrl);

async function main() {
  // Fail loudly before touching the database if a pose is invalid.
  const poses = buildScissorPoses().map((pose) => currentPoseSchema.parse(pose));
  if (poses.length !== STEP_TITLES.length) throw new Error('poses and step titles differ');

  await prisma.$transaction(async (tx) => {
    const [start, end] = await Promise.all(
      SEED_POSITIONS.map((p) =>
        tx.position.upsert({
          where: { slug: p.slug },
          create: p,
          update: { name: p.name, role: p.role, description: p.description },
        }),
      ),
    );
    if (!start || !end) throw new Error('positions were not created');

    await tx.tag.upsert({ where: { slug: SEED_TAG.slug }, create: SEED_TAG, update: SEED_TAG });

    const fields = {
      name: SEED_TECHNIQUE.name,
      category: SEED_TECHNIQUE.category,
      level: SEED_TECHNIQUE.level,
      gi: SEED_TECHNIQUE.gi,
      status: 'published' as const,
      keyPoints: [...SEED_TECHNIQUE.keyPoints],
      commonMistakes: [...SEED_TECHNIQUE.commonMistakes],
      startPositionId: start.id,
      endPositionId: end.id,
      tags: { connect: [{ slug: SEED_TAG.slug }] },
    };
    const technique = await tx.technique.upsert({
      where: { slug: SEED_TECHNIQUE.slug },
      create: { slug: SEED_TECHNIQUE.slug, ...fields, publishedAt: new Date() },
      update: { ...fields, tags: { set: [{ slug: SEED_TAG.slug }] } },
    });

    await tx.step.deleteMany({ where: { techniqueId: technique.id } });
    await tx.step.createMany({
      data: poses.map((pose, i) => ({
        techniqueId: technique.id,
        order: i + 1,
        title: STEP_TITLES[i] ?? '',
        text: '',
        transitionMs: DEFAULT_TRANSITION_MS,
        skeleton: pose.skeleton,
        pose,
      })),
    });
  });
}

main()
  .then(() => console.log('Seed done: scissor sweep'))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
