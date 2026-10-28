import { adminSessionSchema, loginInputSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { verifyPassword } from '../auth/password';
import { clearSession, issueSession } from '../auth/session';
import type { AppConfig } from '../config';
import { sendApiError } from '../errors';
import type { PrismaClient } from '../generated/prisma/client';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW = '15 minutes';

export function registerAuthRoutes(
  app: FastifyInstance,
  { prisma, config }: { prisma: PrismaClient; config: AppConfig },
): void {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: LOGIN_MAX_ATTEMPTS, timeWindow: LOGIN_WINDOW } } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      // safeParse, and the body is never logged: a mistyped field may be the password.
      const input = loginInputSchema.safeParse(request.body);
      if (!input.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');

      const admin = await prisma.admin.findUnique({ where: { email: input.data.email } });
      // Verified against a dummy hash when the email is unknown: same cost, same answer.
      const ok = await verifyPassword(admin?.passwordHash ?? null, input.data.password);
      if (!admin || !ok) return sendApiError(reply, 401, 'unauthorized', 'Invalid credentials');

      issueSession(app, reply, config, admin.id);
      return adminSessionSchema.parse({ email: admin.email });
    },
  );

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    clearSession(reply, config);
    return reply.status(204).send();
  });
}
