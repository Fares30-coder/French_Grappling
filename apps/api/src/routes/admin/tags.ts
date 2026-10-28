import { type AdminTag, adminTagListSchema, adminTagSchema, tagInputSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { isUniqueViolation } from '../../db-errors';
import { sendApiError } from '../../errors';
import type { PrismaClient, Tag } from '../../generated/prisma/client';
import { toTagData } from '../../techniques/position-write';

const toAdminTag = (t: Tag): AdminTag =>
  adminTagSchema.parse({ id: t.id, slug: t.slug, name: t.name });

export function registerAdminTagRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/tags', async () => {
    const tags = (await prisma.tag.findMany()).map(toAdminTag);
    tags.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
    return adminTagListSchema.parse(tags);
  });

  app.post('/tags', async (request, reply) => {
    const input = tagInputSchema.safeParse(request.body);
    if (!input.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    try {
      const row = await prisma.tag.create({ data: toTagData(input.data) });
      return reply.status(201).send(toAdminTag(row));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return sendApiError(reply, 409, 'conflict', 'This slug is already used', 'slug_taken');
      }
      throw error;
    }
  });
}
