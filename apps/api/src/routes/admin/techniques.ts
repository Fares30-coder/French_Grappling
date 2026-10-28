import {
  idParamsSchema,
  techniqueCreateInputSchema,
  techniqueUpdateInputSchema,
  versionInputSchema,
} from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { requireNoBody, sendApiError } from '../../errors';
import type { PrismaClient } from '../../generated/prisma/client';
import {
  findAdminTechnique,
  listAdminTechniques,
} from '../../techniques/admin-technique-repository';
import {
  createTechnique,
  deleteTechnique,
  duplicateTechnique,
  setTechniqueStatus,
  updateTechnique,
} from '../../techniques/technique-write';
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

  for (const [action, status] of [
    ['publish', 'published'],
    ['unpublish', 'draft'],
  ] as const) {
    app.post(`/techniques/:id/${action}`, async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params);
      const input = versionInputSchema.safeParse(request.body);
      if (!params.success || !input.success) {
        return sendApiError(reply, 400, 'bad_request', 'Invalid request');
      }
      const row = await setTechniqueStatus(prisma, params.data.id, input.data.version, status);
      if (!row) throw new Error('technique not found after update'); // cannot happen: committed above
      return toAdminTechnique(row);
    });
  }

  app.post('/techniques/:id/duplicate', { preHandler: requireNoBody }, async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    const row = await duplicateTechnique(prisma, params.data.id);
    if (!row) throw new Error('duplicated technique not found'); // cannot happen: committed above
    return reply.status(201).send(toAdminTechnique(row));
  });

  app.delete('/techniques/:id', { preHandler: requireNoBody }, async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    await deleteTechnique(prisma, params.data.id);
    return reply.status(204).send();
  });
}
