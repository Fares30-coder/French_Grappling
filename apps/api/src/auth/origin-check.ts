import type { FastifyInstance } from 'fastify';
import { sendApiError } from '../errors';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence (with SameSite=Strict): refuses any unsafe request whose `Origin` header is missing
 * or not in `allowedOrigins`. Browsers always send `Origin` on these methods.
 */
export function registerOriginCheck(app: FastifyInstance, allowedOrigins: ReadonlyArray<string>) {
  const allowed = new Set(allowedOrigins);
  app.addHook('onRequest', async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin === undefined || !allowed.has(origin)) {
      return sendApiError(reply, 403, 'forbidden', 'Forbidden origin');
    }
  });
}
