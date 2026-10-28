import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../config';
import { sendApiError } from '../errors';
import type { PrismaClient } from '../generated/prisma/client';
import { registerMeRoute } from '../routes/admin/me';
import { authenticate, issueSession, shouldRenew } from './session';

type Options = { prisma: PrismaClient; config: AppConfig };

/**
 * Everything under /api/admin lives in this one encapsulated plugin, so the auth hook and the
 * no-store header apply to every route, including future ones and unknown paths.
 */
export const adminPlugin: FastifyPluginAsync<Options> = async (app, { prisma, config }) => {
  app.decorateRequest('admin', null);

  app.addHook('onRequest', async (request, reply) => {
    const session = await authenticate(request, prisma);
    if (!session) return sendApiError(reply, 401, 'unauthorized', 'Authentication required');
    request.admin = { id: session.admin.id, email: session.admin.email };

    if (shouldRenew(session.payload.exp, Math.floor(Date.now() / 1000))) {
      // authTime is kept: renewal never extends the absolute lifetime.
      issueSession(app, reply, config, session.admin, session.payload.authTime);
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'private, no-store');
    return payload;
  });

  // Unknown /api/admin paths go through the auth hook too: 401 when logged out, 404 otherwise.
  app.setNotFoundHandler((_request, reply) =>
    sendApiError(reply, 404, 'not_found', 'Route not found'),
  );

  registerMeRoute(app);
};
