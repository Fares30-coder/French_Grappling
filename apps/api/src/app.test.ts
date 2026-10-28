import { apiErrorSchema } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { createPrisma } from './db';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = buildApp({ prisma });

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
});
