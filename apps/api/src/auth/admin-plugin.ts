import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../config';
import { sendApiError } from '../errors';
import type { PrismaClient } from '../generated/prisma/client';
import { registerMeRoute } from '../routes/admin/me';
import { issueSession, sessionPayloadSchema, shouldRenew } from './session';

type Options = { prisma: PrismaClient; config: AppConfig };

/**
 * Everything under /api/admin lives in this one encapsulated plugin, so the auth hook and the
 * no-store header apply to every route, including future ones and unknown paths.
 */
export const adminPlugin: FastifyPluginAsync<Options> = async (app, { prisma, config }) => {
  app.decorateRequest('admin', null);

  app.addHook('onRequest', async (request, reply) => {
    const unauthorized = () => sendApiError(reply, 401, 'unauthorized', 'Authentication required');

    // Cookie only: an Authorization header must never authenticate an admin request.
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      return unauthorized();
    }
    const payload = sessionPayloadSchema.safeParse(request.user);
    if (!payload.success) return unauthorized();

    // Deleting the admin revokes the session immediately.
    const admin = await prisma.admin.findUnique({ where: { id: payload.data.sub } });
    if (!admin) return unauthorized();
    request.admin = { id: admin.id, email: admin.email };

    if (shouldRenew(payload.data.exp, Math.floor(Date.now() / 1000))) {
      issueSession(app, reply, config, admin.id);
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
