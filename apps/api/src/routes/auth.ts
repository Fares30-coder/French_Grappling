import { adminSessionSchema, loginInputSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { issueDevice, readDevice } from '../auth/device';
import { createLoginLimiter } from '../auth/login-limiter';
import { verifyPassword } from '../auth/password';
import { authenticate, clearSession, issueSession } from '../auth/session';
import type { AppConfig } from '../config';
import { sendApiError } from '../errors';
import type { PrismaClient } from '../generated/prisma/client';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW = '15 minutes';

export function registerAuthRoutes(
  app: FastifyInstance,
  { prisma, config }: { prisma: PrismaClient; config: AppConfig },
): void {
  const accountLimiter = createLoginLimiter();
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: LOGIN_MAX_ATTEMPTS, timeWindow: LOGIN_WINDOW } } },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      // safeParse, and the body is never logged: a mistyped field may be the password.
      const input = loginInputSchema.safeParse(request.body);
      if (!input.success) return sendApiError(reply, 400, 'bad_request', 'Invalid request');

      const admin = await prisma.admin.findUnique({ where: { email: input.data.email } });
      // A device that logged in before is not locked out by the per-account cap (someone who
      // knows the email could otherwise block the owner on purpose). The per-IP limit still applies.
      const device = readDevice(app, request, config);
      const trusted =
        device !== null &&
        admin !== null &&
        device.sub === admin.id &&
        device.email === admin.email.toLowerCase();

      // Same answer as the per-IP limit, whether or not the account exists.
      if (!trusted && accountLimiter.isBlocked(input.data.email)) {
        return sendApiError(reply, 429, 'rate_limited', 'Invalid request');
      }

      // Verified against a dummy hash when the email is unknown: same cost, same answer.
      const ok = await verifyPassword(admin?.passwordHash ?? null, input.data.password);
      if (!admin || !ok) {
        if (!trusted) accountLimiter.recordFailure(input.data.email);
        return sendApiError(reply, 401, 'unauthorized', 'Invalid credentials');
      }
      accountLimiter.reset(input.data.email);

      issueSession(app, reply, config, admin);
      issueDevice(app, reply, config, admin);
      return adminSessionSchema.parse({ email: admin.email });
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    // A valid session is revoked server-side (every token of the admin dies), not only forgotten.
    const session = await authenticate(request, prisma);
    if (session) {
      await prisma.admin.updateMany({
        where: { id: session.admin.id, sessionVersion: session.admin.sessionVersion },
        data: { sessionVersion: { increment: 1 } },
      });
    }
    clearSession(reply, config);
    return reply.status(204).send();
  });
}
