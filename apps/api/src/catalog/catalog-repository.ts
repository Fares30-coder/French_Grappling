import type { TechniqueListQuery } from '@tatamap/shared';
import type { GiMode, Prisma, PrismaClient } from '../generated/prisma/client';

const listInclude = {
  startPosition: true,
  endPosition: true,
  tags: true,
  steps: { orderBy: { order: 'asc' }, take: 1 },
  _count: { select: { steps: true } },
} satisfies Prisma.TechniqueInclude;

export type TechniqueListRow = Prisma.TechniqueGetPayload<{ include: typeof listInclude }>;

/** `gi=gi` / `gi=nogi` also match techniques done in both; `gi=both` only those. */
const giModes = (gi: GiMode): GiMode[] => (gi === 'both' ? ['both'] : [gi, 'both']);

/**
 * Published techniques matching the structured filters (`q` is applied by the caller, on
 * accent-free keys). The catalog stays small (tens of techniques): no pagination.
 */
export function findPublishedTechniques(
  prisma: PrismaClient,
  query: Omit<TechniqueListQuery, 'q'>,
): Promise<TechniqueListRow[]> {
  return prisma.technique.findMany({
    where: {
      status: 'published',
      ...(query.categorie ? { category: query.categorie } : {}),
      ...(query.niveau ? { level: query.niveau } : {}),
      ...(query.gi ? { gi: { in: giModes(query.gi) } } : {}),
      ...(query.position ? { startPosition: { slug: query.position } } : {}),
    },
    include: listInclude,
  });
}

const positionInclude = {
  _count: { select: { techniquesFrom: { where: { status: 'published' } } } },
} satisfies Prisma.PositionInclude;

export type PositionCountRow = Prisma.PositionGetPayload<{ include: typeof positionInclude }>;

/** Every position, with the number of published techniques starting from it. */
export function findPositionsWithCounts(prisma: PrismaClient): Promise<PositionCountRow[]> {
  return prisma.position.findMany({ include: positionInclude });
}

const edgeSelect = {
  slug: true,
  name: true,
  category: true,
  level: true,
  gi: true,
  startPosition: { select: { slug: true } },
  endPosition: { select: { slug: true } },
} satisfies Prisma.TechniqueSelect;

export type EdgeRow = Prisma.TechniqueGetPayload<{ select: typeof edgeSelect }>;

export function findPublishedEdges(prisma: PrismaClient): Promise<EdgeRow[]> {
  return prisma.technique.findMany({ where: { status: 'published' }, select: edgeSelect });
}

/** Tags used by at least one published technique. */
export function findPublicTags(prisma: PrismaClient) {
  return prisma.tag.findMany({
    where: { techniques: { some: { status: 'published' } } },
    select: { slug: true, name: true },
  });
}
