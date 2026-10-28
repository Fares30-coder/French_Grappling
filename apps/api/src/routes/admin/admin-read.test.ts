import {
  adminPositionListSchema,
  adminTagListSchema,
  adminTechniqueListSchema,
  adminTechniqueSchema,
  apiErrorSchema,
} from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../db';
import {
  buildTestApp,
  createTestAdmin,
  createTestTechnique,
  sessionCookie,
} from '../../test-utils';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app: FastifyInstance = await buildTestApp(prisma);
const admin = await createTestAdmin(prisma);
const draft = await createTestTechnique(prisma);
const cookie = sessionCookie(app, admin.id);

afterAll(async () => {
  await prisma.technique.delete({ where: { id: draft.id } });
  await prisma.admin.delete({ where: { id: admin.id } });
  await app.close();
  await prisma.$disconnect();
});

const get = (url: string, headers: Record<string, string> = { cookie }) =>
  app.inject({ method: 'GET', url, headers });

describe('GET /api/admin/techniques', () => {
  it('lists the scissor sweep and the draft created by the test', async () => {
    const res = await get('/api/admin/techniques');
    expect(res.statusCode).toBe(200);
    const list = adminTechniqueListSchema.parse(res.json());
    const scissor = list.find((t) => t.slug === 'ciseau-garde-fermee');
    expect(scissor).toMatchObject({ stepCount: 5, status: 'published' });
    expect(list.find((t) => t.id === draft.id)).toMatchObject({ status: 'draft', stepCount: 1 });
  });

  it('is sorted by updatedAt, most recent first', async () => {
    const list = adminTechniqueListSchema.parse((await get('/api/admin/techniques')).json());
    const times = list.map((t) => Date.parse(t.updatedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe('GET /api/admin/techniques/:id', () => {
  it('returns the scissor sweep as an admin technique', async () => {
    const list = adminTechniqueListSchema.parse((await get('/api/admin/techniques')).json());
    const id = list.find((t) => t.slug === 'ciseau-garde-fermee')?.id ?? '';
    const res = await get(`/api/admin/techniques/${id}`);
    expect(res.statusCode).toBe(200);
    const t = adminTechniqueSchema.parse(res.json());
    expect(t.steps).toHaveLength(5);
    expect(t.version).toBeGreaterThanOrEqual(1);
    expect(t.tagIds).toHaveLength(1);
  });

  it('returns a draft too', async () => {
    const res = await get(`/api/admin/techniques/${draft.id}`);
    expect(adminTechniqueSchema.parse(res.json())).toMatchObject({ status: 'draft', version: 1 });
  });

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    const unknown = await get('/api/admin/techniques/00000000-0000-4000-8000-000000000000');
    expect(unknown.statusCode).toBe(404);
    expect(apiErrorSchema.parse(unknown.json()).error.code).toBe('not_found');
    const bad = await get('/api/admin/techniques/pas-un-uuid');
    expect(bad.statusCode).toBe(400);
  });
});

describe('GET /api/admin/positions and /tags', () => {
  it('list positions and tags', async () => {
    const positions = adminPositionListSchema.parse((await get('/api/admin/positions')).json());
    expect(positions.map((p) => p.slug)).toEqual(
      expect.arrayContaining(['garde-fermee', 'montee']),
    );
    const names = positions.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    const tags = adminTagListSchema.parse((await get('/api/admin/tags')).json());
    expect(tags.map((t) => t.slug)).toContain('fondamentaux');
  });
});

describe('guard and caching', () => {
  const urls = [
    '/api/admin/techniques',
    `/api/admin/techniques/${draft.id}`,
    '/api/admin/positions',
    '/api/admin/tags',
  ];
  it.each(urls)('%s answers 401 without a cookie', async (url) => {
    const res = await get(url, {});
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
  it.each(urls)('%s is private, no-store when logged in', async (url) => {
    const res = await get(url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});
