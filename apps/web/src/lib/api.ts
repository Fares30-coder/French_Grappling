import { type ApiError, type ApiErrorReason, apiErrorSchema } from '@tatamap/shared';
import type { z } from 'zod';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiError['error']['code'] | 'network' | 'invalid_response';
  readonly reason?: ApiErrorReason;

  constructor(
    status: number,
    code: ApiRequestError['code'],
    message: string,
    reason?: ApiErrorReason,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    if (reason !== undefined) this.reason = reason;
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

// Read on every call (not at module load) so tests can change it.
const apiBase = (): string => (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Sends the request and returns the response; throws ApiRequestError on network or HTTP failure. */
async function send(path: string, { method = 'GET', body, signal }: RequestOptions) {
  // Fastify rejects a JSON content type with an empty body: only set it when there is a body.
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(apiBase() + path, {
      method,
      credentials: 'include',
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new ApiRequestError(0, 'network', 'Network error');
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, reason } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, reason);
    }
    throw new ApiRequestError(response.status, 'internal', `HTTP ${response.status}`);
  }
  return response;
}

/** Sends a request and validates the JSON response with `schema`. Throws ApiRequestError. */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  const response = await send(path, options);
  const payload: unknown = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiRequestError(response.status, 'invalid_response', 'Invalid API response');
  }
  return parsed.data;
}

/** Same, for responses without a body (204). */
export async function apiSend(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}

/** Kept for existing callers: apiRequest with GET. */
export const fetchJson = <S extends z.ZodType>(
  path: string,
  schema: S,
  init?: { signal?: AbortSignal },
): Promise<z.output<S>> => apiRequest(path, schema, init?.signal ? { signal: init.signal } : {});
