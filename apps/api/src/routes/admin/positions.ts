import { type AdminPosition, adminPositionListSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client';

export function registerAdminPositionRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/positions', async () => {
    const rows = await prisma.position.findMany();
    const positions: AdminPosition[] = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      role: p.role,
    }));
    positions.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
    return adminPositionListSchema.parse(positions);
  });
}
