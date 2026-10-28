import {
  type AdminPosition,
  adminPositionListSchema,
  adminPositionSchema,
  idParamsSchema,
  positionInputSchema,
} from '@tatamap/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { isRecordNotFound, isUniqueViolation } from '../../db-errors';
import { sendApiError } from '../../errors';
import type { Position, PrismaClient } from '../../generated/prisma/client';
import { toPositionData } from '../../techniques/position-write';

const toAdminPosition = (p: Position): AdminPosition =>
  adminPositionSchema.parse({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    role: p.role,
  });

const slugTaken = (reply: FastifyReply) =>
  sendApiError(reply, 409, 'conflict', 'This slug is already used', 'slug_taken');

export function registerAdminPositionRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/positions', async () => {
    const positions = (await prisma.position.findMany()).map(toAdminPosition);
    positions.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
    return adminPositionListSchema.parse(positions);
  });

  app.post('/positions', async (request, reply) => {
    const input = positionInputSchema.safeParse(request.body);
    if (!input.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    try {
      const row = await prisma.position.create({ data: toPositionData(input.data) });
      return reply.status(201).send(toAdminPosition(row));
    } catch (error) {
      if (isUniqueViolation(error)) return slugTaken(reply);
      throw error;
    }
  });

  app.put('/positions/:id', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    const input = positionInputSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return sendApiError(reply, 400, 'bad_request', 'Invalid request');
    }
    try {
      const row = await prisma.position.update({
        where: { id: params.data.id },
        data: toPositionData(input.data),
      });
      return toAdminPosition(row);
    } catch (error) {
      if (isRecordNotFound(error)) {
        return sendApiError(reply, 404, 'not_found', 'Position not found');
      }
      if (isUniqueViolation(error)) return slugTaken(reply);
      throw error;
    }
  });
}
