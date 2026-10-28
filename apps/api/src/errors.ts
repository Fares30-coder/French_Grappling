import type { ApiError, ApiErrorReason } from '@tatamap/shared';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type ApiErrorCode = ApiError['error']['code'];

/** Sends an error in the shared ApiError format. */
export function sendApiError(
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  message: string,
  reason?: ApiErrorReason,
): FastifyReply {
  const payload: ApiError = { error: { code, message, ...(reason ? { reason } : {}) } };
  return reply.status(status).send(payload);
}

const CLIENT_ERROR_CODES: Partial<Record<number, ApiErrorCode>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
};

/** Maps a 4xx status to its API code; unlisted ones fall back to `bad_request`. */
export const codeForClientStatus = (status: number): ApiErrorCode =>
  CLIENT_ERROR_CODES[status] ?? 'bad_request';

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Client errors raised by Fastify itself (malformed JSON, payload too large...) keep their status.
    const status = error.statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return sendApiError(reply, status, codeForClientStatus(status), 'Invalid request');
    }
    // Everything else (including ZodError from output validation) is a server fault.
    // Log the details server-side only; never leak them to the client.
    request.log.error({ err: error }, 'unhandled error');
    return sendApiError(reply, 500, 'internal', 'Internal server error');
  });

  app.setNotFoundHandler((_request, reply) =>
    sendApiError(reply, 404, 'not_found', 'Route not found'),
  );
}
