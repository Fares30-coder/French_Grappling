import {
  idParamsSchema,
  techniqueCreateInputSchema,
  techniqueUpdateInputSchema,
} from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { sendApiError } from '../../errors';
import type { PrismaClient } from '../../generated/prisma/client';
import {
  findAdminTechnique,
  listAdminTechniques,
} from '../../techniques/admin-technique-repository';
import { createTechnique, updateTechnique } from '../../techniques/technique-write';
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

  app.post('/techniques', async (request, reply) => {
    const input = techniqueCreateInputSchema.safeParse(request.body);
    if (!input.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    const row = await createTechnique(prisma, input.data);
    if (!row) throw new Error('created technique not found'); // cannot happen: same transaction result
    return reply.status(201).send(toAdminTechnique(row));
  });

  app.put('/techniques/:id', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    const input = techniqueUpdateInputSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    }
    const row = await updateTechnique(prisma, params.data.id, input.data);
    if (!row) throw new Error('updated technique not found'); // cannot happen: committed above
    return toAdminTechnique(row);
  });
}
