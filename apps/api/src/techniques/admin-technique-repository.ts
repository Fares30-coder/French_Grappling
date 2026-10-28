import type { Prisma, PrismaClient } from '../generated/prisma/client';

/** Admin view: every status, every chain (drafts included), tags and chains in a stable order. */
export const adminTechniqueInclude = {
  tags: { orderBy: [{ name: 'asc' }, { id: 'asc' }] },
  steps: { orderBy: { order: 'asc' } },
  chainsFrom: { orderBy: [{ type: 'asc' }, { to: { name: 'asc' } }, { id: 'asc' }] },
} satisfies Prisma.TechniqueInclude;

export type AdminTechniqueRow = Prisma.TechniqueGetPayload<{
  include: typeof adminTechniqueInclude;
}>;

export function findAdminTechnique(
  prisma: PrismaClient,
  id: string,
): Promise<AdminTechniqueRow | null> {
  return prisma.technique.findUnique({ where: { id }, include: adminTechniqueInclude });
}

export const adminListInclude = {
  startPosition: { select: { name: true } },
  _count: { select: { steps: true } },
} satisfies Prisma.TechniqueInclude;

export type AdminListRow = Prisma.TechniqueGetPayload<{ include: typeof adminListInclude }>;

export function listAdminTechniques(prisma: PrismaClient): Promise<AdminListRow[]> {
  return prisma.technique.findMany({
    include: adminListInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
}
