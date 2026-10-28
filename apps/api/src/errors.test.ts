import { apiErrorSchema } from '@tatamap/shared';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { codeForClientStatus, registerErrorHandlers, sendApiError } from './errors';

function build() {
  const app = Fastify({ logger: false, bodyLimit: 16 });
  registerErrorHandlers(app);
  app.post('/echo', async (request) => request.body);
  return app;
}

describe('error handler', () => {
  it('keeps the status of Fastify 4xx errors (415 unsupported media type)', async () => {
    const res = await build().inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/x-unknown' },
      payload: 'x',
    });
    expect(res.statusCode).toBe(415);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('bad_request');
  });

  it('keeps the status of 413 payload too large', async () => {
    const res = await build().inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ big: 'x'.repeat(100) }),
    });
    expect(res.statusCode).toBe(413);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('payload_too_large');
  });

  it('maps statuses to codes with a bad_request fallback', () => {
    expect(codeForClientStatus(401)).toBe('unauthorized');
    expect(codeForClientStatus(429)).toBe('rate_limited');
    expect(codeForClientStatus(418)).toBe('bad_request');
  });
});

describe('sendApiError', () => {
  const run = async (reason?: Parameters<typeof sendApiError>[4]) => {
    const app = Fastify({ logger: false });
    app.get('/x', async (_req, reply) => sendApiError(reply, 409, 'conflict', 'Stale', reason));
    return (await app.inject({ method: 'GET', url: '/x' })).json();
  };

  it('includes the reason when given', async () => {
    const body = await run('version_mismatch');
    expect(apiErrorSchema.parse(body).error.reason).toBe('version_mismatch');
  });

  it('omits the reason otherwise', async () => {
    const body = await run();
    expect(body).toEqual({ error: { code: 'conflict', message: 'Stale' } });
  });
});
