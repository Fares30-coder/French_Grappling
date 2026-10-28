import { apiErrorSchema } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from './db';
import { buildTestApp, ORIGIN } from './test-utils';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = await buildTestApp(prisma);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('unknown route returns 404 in the apiError format', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    const parsed = apiErrorSchema.parse(res.json());
    expect(parsed.error.code).toBe('not_found');
  });

  it('sets security headers (nosniff, CSP default-src none)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
  });

  it('rejects a 300 KiB body with 413 payload_too_large', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nope',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'x'.repeat(300 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('payload_too_large');
  });
});

describe('Origin check', () => {
  it('refuses an unsafe request without Origin', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/nope' });
    expect(res.statusCode).toBe(403);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('forbidden');
  });

  it('refuses an unsafe request from another origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/nope',
      headers: { origin: 'http://evil.test' },
    });
    expect(res.statusCode).toBe(403);
  });

  it.each(['PUT', 'PATCH', 'DELETE'] as const)('also covers %s', async (method) => {
    const res = await app.inject({ method, url: '/api/nope' });
    expect(res.statusCode).toBe(403);
  });

  it('lets an unsafe request through from an allowed origin', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/nope', headers: { origin: ORIGIN } });
    expect(res.statusCode).toBe(404);
  });

  it('does not require Origin on GET', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });
});
