import { techniqueSlugParamsSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client';
import { findPublishedTechnique } from '../techniques/technique-repository';
import { toTechniqueDetail } from '../techniques/to-technique-detail';

export function registerTechniqueRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/api/techniques/:slug', async (request, reply) => {
    const { slug } = techniqueSlugParamsSchema.parse(request.params);
    const row = await findPublishedTechnique(prisma, slug);
    if (!row) {
      return reply
        .status(404)
        .send({ error: { code: 'not_found', message: 'Technique not found' } });
    }
    reply.header('Cache-Control', 'public, max-age=60');
    return toTechniqueDetail(row);
  });
}
