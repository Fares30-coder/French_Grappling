import { type AdminSession, adminSessionSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { sendApiError } from '../../errors';

export function registerMeRoute(app: FastifyInstance): void {
  app.get('/me', async (request, reply) => {
    if (!request.admin) return sendApiError(reply, 401, 'unauthorized', 'Authentication required');
    const session: AdminSession = adminSessionSchema.parse({ email: request.admin.email });
    return session;
  });
}
