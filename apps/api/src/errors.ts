import type { ApiError } from '@tatamap/shared';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

const body = (code: ApiError['error']['code'], message: string): ApiError => ({
  error: { code, message },
});

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError | ZodError, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof ZodError) {
        return reply.status(400).send(body('bad_request', 'Invalid request'));
      }
      // Client errors raised by Fastify itself (malformed JSON, payload too large...).
      const status = 'statusCode' in error ? error.statusCode : undefined;
      if (status !== undefined && status >= 400 && status < 500) {
        return reply.status(400).send(body('bad_request', 'Invalid request'));
      }
      // Log the details server-side only; never leak them to the client.
      request.log.error({ err: error }, 'unhandled error');
      return reply.status(500).send(body('internal', 'Internal server error'));
    },
  );

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(body('not_found', 'Route not found'));
  });
}
