import { type ApiError, apiErrorSchema } from '@tatamap/shared';
import type { z } from 'zod';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiError['error']['code'] | 'network' | 'invalid_response';

  constructor(status: number, code: ApiRequestError['code'], message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/** GETs `path`, then validates the JSON body with `schema`. Throws ApiRequestError on any failure. */
export async function fetchJson<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: { signal?: AbortSignal },
): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' }, ...init });
  } catch {
    throw new ApiRequestError(0, 'network', 'Network error');
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiRequestError(response.status, 'internal', `HTTP ${response.status}`);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiRequestError(response.status, 'invalid_response', 'Invalid API response');
  }
  return parsed.data;
}
