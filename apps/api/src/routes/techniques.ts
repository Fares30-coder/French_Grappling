import { techniqueSlugParamsSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { sendApiError } from '../errors';
import type { PrismaClient } from '../generated/prisma/client';
import { findPublishedTechnique } from '../techniques/technique-repository';
import { toTechniqueDetail } from '../techniques/to-technique-detail';

export function registerTechniqueRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/api/techniques/:slug', async (request, reply) => {
    const params = techniqueSlugParamsSchema.safeParse(request.params);
    if (!params.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    const row = await findPublishedTechnique(prisma, params.data.slug);
    if (!row) return sendApiError(reply, 404, 'not_found', 'Technique not found');
    reply.header('Cache-Control', 'public, max-age=60');
    return toTechniqueDetail(row);
  });
}
