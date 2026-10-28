import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from './db';
import { uniqueSlug } from './test-utils';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
afterAll(() => prisma.$disconnect());

describe('database constraints', () => {
  it('refuses a chain from a technique to itself (Chain_no_self_link)', async () => {
    const start = await prisma.position.findUniqueOrThrow({ where: { slug: 'garde-fermee' } });
    const slug = uniqueSlug('self-chain');
    const technique = await prisma.technique.create({
      data: {
        slug,
        name: slug,
        category: 'submission',
        level: 'beginner',
        gi: 'both',
        startPositionId: start.id,
      },
    });
    try {
      expect(technique.version).toBe(1);
      await expect(
        prisma.chain.create({
          data: { fromId: technique.id, toId: technique.id, type: 'followup' },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.technique.delete({ where: { id: technique.id } });
    }
  });
});
