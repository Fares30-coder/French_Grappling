import { type AdminTag, adminTagListSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client';

export function registerAdminTagRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/tags', async () => {
    const rows = await prisma.tag.findMany();
    const tags: AdminTag[] = rows.map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
    tags.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
    return adminTagListSchema.parse(tags);
  });
}
