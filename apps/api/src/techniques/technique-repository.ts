import type { Prisma, PrismaClient } from '../generated/prisma/client';

const publishedTechniqueInclude = {
  startPosition: true,
  endPosition: true,
  tags: true,
  steps: { orderBy: { order: 'asc' } },
  chainsFrom: {
    where: { to: { status: 'published' } },
    include: { to: true },
    // Stable order: enum declaration order (followup, counter, alternative), then name, then id.
    orderBy: [{ type: 'asc' }, { to: { name: 'asc' } }, { id: 'asc' }],
  },
} satisfies Prisma.TechniqueInclude;

export type TechniqueRow = Prisma.TechniqueGetPayload<{
  include: typeof publishedTechniqueInclude;
}>;

/** Returns a published technique with everything the detail page needs, or null. */
export function findPublishedTechnique(
  prisma: PrismaClient,
  slug: string,
): Promise<TechniqueRow | null> {
  return prisma.technique.findFirst({
    where: { slug, status: 'published' },
    include: publishedTechniqueInclude,
  });
}
