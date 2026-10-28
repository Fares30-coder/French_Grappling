import { adminTechniqueSchema, apiErrorSchema, STARTER_POSE } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../db';
import { buildTestApp, createTestAdmin, ORIGIN, sessionCookie, uniqueSlug } from '../../test-utils';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = await buildTestApp(prisma);
const admin = await createTestAdmin(prisma);
const cookie = sessionCookie(app, admin.id);
const prefix = uniqueSlug('cr');
const start = await prisma.position.findUniqueOrThrow({ where: { slug: 'garde-fermee' } });
const end = await prisma.position.findUniqueOrThrow({ where: { slug: 'montee' } });

afterAll(async () => {
  await prisma.technique.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  await app.close();
  await prisma.$disconnect();
});

const create = (payload: unknown, headers: Record<string, string> = { origin: ORIGIN, cookie }) =>
  app.inject({ method: 'POST', url: '/api/admin/techniques', headers, payload: payload as object });

const base = (overrides: Record<string, unknown> = {}) => ({
  name: `${prefix} Ciseau`,
  category: 'sweep',
  level: 'beginner',
  gi: 'both',
  startPositionId: start.id,
  endPositionId: end.id,
  ...overrides,
});

describe('POST /api/admin/techniques', () => {
  it('creates a draft with one starter step', async () => {
    const slug = `${prefix}-explicit`;
    const res = await create(base({ slug }));
    expect(res.statusCode).toBe(201);
    const t = adminTechniqueSchema.parse(res.json());
    expect(t).toMatchObject({ slug, status: 'draft', version: 1, publishedAt: null });
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0]?.pose).toEqual(STARTER_POSE);
    expect(t.keyPoints).toEqual([]);
  });

  it('generates the slug from the name when it is absent', async () => {
    const res = await create(base({ name: `${prefix} Clé de bras` }));
    expect(res.statusCode).toBe(201);
    expect(adminTechniqueSchema.parse(res.json()).slug).toBe(`${prefix}-cle-de-bras`);
  });

  it('answers 400 when the generated slug is too short', async () => {
    const res = await create(base({ name: '!' }));
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('bad_request');
  });

  it('answers 409 slug_taken, and the loser leaves nothing behind', async () => {
    const slug = `${prefix}-taken`;
    expect((await create(base({ slug }))).statusCode).toBe(201);
    const res = await create(base({ slug }));
    expect(res.statusCode).toBe(409);
    expect(apiErrorSchema.parse(res.json()).error.reason).toBe('slug_taken');
    expect(await prisma.technique.count({ where: { slug } })).toBe(1);
  });

  it('answers 400 unknown_reference for an unknown position', async () => {
    const res = await create(
      base({ slug: `${prefix}-ghost`, startPositionId: '00000000-0000-4000-8000-000000000000' }),
    );
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.reason).toBe('unknown_reference');
    expect(await prisma.technique.count({ where: { slug: `${prefix}-ghost` } })).toBe(0);
  });

  it('refuses a submission with an end position, extra fields and a bad Origin', async () => {
    expect((await create(base({ category: 'submission' }))).statusCode).toBe(400);
    expect((await create(base({ status: 'published' }))).statusCode).toBe(400);
    expect((await create(base(), { cookie })).statusCode).toBe(403);
    expect((await create(base(), { origin: ORIGIN })).statusCode).toBe(401);
  });

  it('does not expose the draft publicly', async () => {
    const slug = `${prefix}-hidden`;
    await create(base({ slug }));
    const res = await app.inject({ method: 'GET', url: `/api/techniques/${slug}` });
    expect(res.statusCode).toBe(404);
  });
});
