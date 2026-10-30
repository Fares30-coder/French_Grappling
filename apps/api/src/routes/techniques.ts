import { techniqueListQuerySchema, techniqueSlugParamsSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import {
  findPositionsWithCounts,
  findPublicTags,
  findPublishedEdges,
  findPublishedTechniques,
} from '../catalog/catalog-repository';
import { toGraph, toPositionList, toTagList, toTechniqueList } from '../catalog/to-catalog';
import { sendApiError } from '../errors';
import type { PrismaClient } from '../generated/prisma/client';
import { findPublishedTechnique } from '../techniques/technique-repository';
import { toTechniqueDetail } from '../techniques/to-technique-detail';

/** Public reads: one minute fresh, then served stale for ten while revalidating. */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=600';

export function registerTechniqueRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/api/techniques', async (request, reply) => {
    const query = techniqueListQuerySchema.safeParse(request.query);
    if (!query.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    const { q, ...filters } = query.data;
    const rows = await findPublishedTechniques(prisma, filters);
    reply.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return toTechniqueList(rows, q);
  });

  app.get('/api/techniques/:slug', async (request, reply) => {
    const params = techniqueSlugParamsSchema.safeParse(request.params);
    if (!params.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    const row = await findPublishedTechnique(prisma, params.data.slug);
    if (!row) return sendApiError(reply, 404, 'not_found', 'Technique not found');
    reply.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return toTechniqueDetail(row);
  });

  app.get('/api/positions', async (_request, reply) => {
    const rows = await findPositionsWithCounts(prisma);
    reply.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return toPositionList(rows);
  });

  app.get('/api/graph', async (_request, reply) => {
    const [positions, edges] = await Promise.all([
      findPositionsWithCounts(prisma),
      findPublishedEdges(prisma),
    ]);
    reply.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return toGraph(positions, edges);
  });

  app.get('/api/tags', async (_request, reply) => {
    const rows = await findPublicTags(prisma);
    reply.header('Cache-Control', PUBLIC_CACHE_CONTROL);
    return toTagList(rows);
  });
}
