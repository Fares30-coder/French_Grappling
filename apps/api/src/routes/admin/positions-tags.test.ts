import {
  adminPositionListSchema,
  adminPositionSchema,
  adminTagListSchema,
  adminTagSchema,
  apiErrorSchema,
} from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../db';
import { buildTestApp, createTestAdmin, ORIGIN, sessionCookie, uniqueSlug } from '../../test-utils';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = await buildTestApp(prisma);
const admin = await createTestAdmin(prisma);
const cookie = sessionCookie(app, admin.id);
const prefix = uniqueSlug('pt');

afterAll(async () => {
  await prisma.position.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.tag.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.admin.delete({ where: { id: admin.id } });
  await app.close();
  await prisma.$disconnect();
});

const send = (
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: unknown,
  headers: Record<string, string> = { origin: ORIGIN, cookie },
) => app.inject({ method, url, headers, ...(payload ? { payload: payload as object } : {}) });

const position = (suffix: string) => ({
  slug: `${prefix}-${suffix}`,
  name: `Position ${suffix}`,
  description: 'une description',
  role: 'top',
});

describe('POST/PUT /api/admin/positions', () => {
  it('creates (201), then lists the position', async () => {
    const created = await send('POST', '/api/admin/positions', position('a'));
    expect(created.statusCode).toBe(201);
    const body = adminPositionSchema.parse(created.json());
    const list = adminPositionListSchema.parse((await send('GET', '/api/admin/positions')).json());
    expect(list.find((p) => p.id === body.id)).toEqual(body);
  });

  it('answers 409 slug_taken on a duplicate slug', async () => {
    await send('POST', '/api/admin/positions', position('dup'));
    const res = await send('POST', '/api/admin/positions', position('dup'));
    expect(res.statusCode).toBe(409);
    expect(apiErrorSchema.parse(res.json()).error.reason).toBe('slug_taken');
  });

  it('renames with PUT, 404 on an unknown id, 409 on a taken slug', async () => {
    const created = adminPositionSchema.parse(
      (await send('POST', '/api/admin/positions', position('b'))).json(),
    );
    const renamed = await send('PUT', `/api/admin/positions/${created.id}`, {
      ...position('b'),
      name: 'Nouveau nom',
    });
    expect(renamed.statusCode).toBe(200);
    expect(adminPositionSchema.parse(renamed.json()).name).toBe('Nouveau nom');

    const unknown = await send(
      'PUT',
      '/api/admin/positions/00000000-0000-4000-8000-000000000000',
      position('x'),
    );
    expect(unknown.statusCode).toBe(404);

    const taken = await send('PUT', `/api/admin/positions/${created.id}`, position('a'));
    expect(taken.statusCode).toBe(409);
  });

  it('answers 400 for a body with an extra id, a bad role or a malformed path id', async () => {
    const extra = await send('POST', '/api/admin/positions', { ...position('c'), id: 'x' });
    expect(extra.statusCode).toBe(400);
    const role = await send('POST', '/api/admin/positions', { ...position('d'), role: 'x' });
    expect(role.statusCode).toBe(400);
    const badId = await send('PUT', '/api/admin/positions/nope', position('e'));
    expect(badId.statusCode).toBe(400);
  });

  it('answers 403 without Origin and 401 without a session', async () => {
    expect((await send('POST', '/api/admin/positions', position('f'), { cookie })).statusCode).toBe(
      403,
    );
    expect(
      (await send('POST', '/api/admin/positions', position('f'), { origin: ORIGIN })).statusCode,
    ).toBe(401);
    expect(
      await prisma.position.count({ where: { slug: { in: [`${prefix}-f`, `${prefix}-c`] } } }),
    ).toBe(0);
  });
});

describe('POST /api/admin/tags', () => {
  it('creates (201), lists it, then 409 slug_taken', async () => {
    const input = { slug: `${prefix}-tag`, name: 'Tag de test' };
    const created = await send('POST', '/api/admin/tags', input);
    expect(created.statusCode).toBe(201);
    const body = adminTagSchema.parse(created.json());
    const list = adminTagListSchema.parse((await send('GET', '/api/admin/tags')).json());
    expect(list.find((t) => t.id === body.id)).toEqual(body);
    const dup = await send('POST', '/api/admin/tags', input);
    expect(dup.statusCode).toBe(409);
    expect(apiErrorSchema.parse(dup.json()).error.reason).toBe('slug_taken');
  });

  it('refuses extra fields, a missing Origin and a missing session', async () => {
    const input = { slug: `${prefix}-t2`, name: 'x' };
    expect((await send('POST', '/api/admin/tags', { ...input, id: 'x' })).statusCode).toBe(400);
    expect((await send('POST', '/api/admin/tags', input, { cookie })).statusCode).toBe(403);
    expect((await send('POST', '/api/admin/tags', input, { origin: ORIGIN })).statusCode).toBe(401);
  });
});
