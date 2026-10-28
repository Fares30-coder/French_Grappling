import { idParamsSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { sendApiError } from '../../errors';
import type { PrismaClient } from '../../generated/prisma/client';
import {
  findAdminTechnique,
  listAdminTechniques,
} from '../../techniques/admin-technique-repository';
import { toAdminTechnique, toAdminTechniqueList } from '../../techniques/to-admin-technique';

export function registerAdminTechniqueRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/techniques', async () => toAdminTechniqueList(await listAdminTechniques(prisma)));

  app.get('/techniques/:id', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    const row = await findAdminTechnique(prisma, params.data.id);
    if (!row) return sendApiError(reply, 404, 'not_found', 'Technique not found');
    return toAdminTechnique(row);
  });
}
