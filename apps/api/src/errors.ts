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

/**
 * A business-rule failure thrown from a service (possibly inside a transaction, which it then
 * rolls back) and turned into an API error by the error handler.
 */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly reason?: ApiErrorReason,
  ) {
    super(message);
  }
}

/**
 * preHandler for write routes that take no body (duplicate, delete, logout): a body, even `{}` or
 * text/plain, is refused instead of silently ignored. The web client sends none (apiSend).
 */
export async function requireNoBody(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  // Returning the reply is what stops an async hook chain once the response has been sent.
  if (request.body !== undefined) {
    return sendApiError(reply, 400, 'bad_request', 'This route takes no body');
  }
  return undefined;
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
    if (error instanceof ApiFailure) {
      return sendApiError(reply, error.status, error.code, error.message, error.reason);
    }
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
