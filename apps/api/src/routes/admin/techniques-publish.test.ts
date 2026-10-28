import { type AdminTechnique, adminTechniqueSchema, apiErrorSchema } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../db';
import {
  buildTestApp,
  createTestAdmin,
  createTestTechnique,
  ORIGIN,
  sessionCookie,
} from '../../test-utils';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = await buildTestApp(prisma);
const admin = await createTestAdmin(prisma);
const cookie = sessionCookie(app, admin.id);
const created: string[] = [];
const SCISSOR = 'ciseau-garde-fermee';
const copyCleanup = { slug: { startsWith: `${SCISSOR}-copie` } };

await prisma.technique.deleteMany({ where: copyCleanup }); // leftovers of an aborted run

afterAll(async () => {
  await prisma.technique.deleteMany({ where: { id: { in: created } } });
  await prisma.technique.deleteMany({ where: copyCleanup });
  await prisma.admin.delete({ where: { id: admin.id } });
  await app.close();
  await prisma.$disconnect();
});

async function make(options: Parameters<typeof createTestTechnique>[1] = {}) {
  const t = await createTestTechnique(prisma, options);
  created.push(t.id);
  return t;
}

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: method === 'GET' ? { cookie } : { origin: ORIGIN, cookie },
    ...(payload ? { payload: payload as object } : {}),
  });
const getAdmin = async (id: string): Promise<AdminTechnique> =>
  adminTechniqueSchema.parse((await call('GET', `/api/admin/techniques/${id}`)).json());
const publicStatus = async (slug: string) =>
  (await app.inject({ method: 'GET', url: `/api/techniques/${slug}` })).statusCode;
const reason = (res: { json(): unknown }) => apiErrorSchema.parse(res.json()).error.reason;

describe('publish / unpublish', () => {
  it('refuses to publish an unfinished draft, then publishes it once it is complete', async () => {
    const { id, slug } = await make();
    const draft = await getAdmin(id);
    const refused = await call('POST', `/api/admin/techniques/${id}/publish`, {
      version: draft.version,
    });
    expect(refused.statusCode).toBe(409);
    expect(reason(refused)).toBe('not_publishable');

    const complete = {
      ...draft,
      keyPoints: ['Un point'],
      steps: [...draft.steps, ...draft.steps],
    };
    const { id: _i, status: _s, publishedAt: _p, updatedAt: _u, ...input } = complete;
    const saved = await call('PUT', `/api/admin/techniques/${id}`, input);
    expect(saved.statusCode).toBe(200);
    expect(await publicStatus(slug)).toBe(404);

    const version = adminTechniqueSchema.parse(saved.json()).version;
    const published = await call('POST', `/api/admin/techniques/${id}/publish`, { version });
    expect(published.statusCode).toBe(200);
    const body = adminTechniqueSchema.parse(published.json());
    expect(body.status).toBe('published');
    expect(body.publishedAt).not.toBeNull();
    expect(body.version).toBe(version + 1);
    expect(await publicStatus(slug)).toBe(200);

    const again = adminTechniqueSchema.parse(
      (await call('POST', `/api/admin/techniques/${id}/publish`, { version: body.version })).json(),
    );
    expect(again.publishedAt).toBe(body.publishedAt);
  });

  it('unpublishes: 404 in public, publishedAt kept', async () => {
    const { id, slug } = await make({ status: 'published', stepCount: 2, keyPoints: ['x'] });
    const before = await getAdmin(id);
    const res = await call('POST', `/api/admin/techniques/${id}/unpublish`, {
      version: before.version,
    });
    expect(res.statusCode).toBe(200);
    const body = adminTechniqueSchema.parse(res.json());
    expect(body.status).toBe('draft');
    expect(body.publishedAt).toBe(before.publishedAt);
    expect(await publicStatus(slug)).toBe(404);
  });

  it('answers 409 version_mismatch for a stale version', async () => {
    const { id } = await make({ status: 'published', stepCount: 2, keyPoints: ['x'] });
    const { version } = await getAdmin(id);
    for (const action of ['publish', 'unpublish']) {
      const res = await call('POST', `/api/admin/techniques/${id}/${action}`, {
        version: version + 5,
      });
      expect(res.statusCode).toBe(409);
      expect(reason(res)).toBe('version_mismatch');
    }
    expect((await getAdmin(id)).version).toBe(version);
  });

  it('answers 404 / 400 for unknown ids, bad ids and bad bodies', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect(
      (await call('POST', `/api/admin/techniques/${ghost}/publish`, { version: 1 })).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', '/api/admin/techniques/nope/publish', { version: 1 })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/api/admin/techniques/${ghost}/publish`, { version: 0 })).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', `/api/admin/techniques/${ghost}/publish`, { version: 1, x: 1 }))
        .statusCode,
    ).toBe(400);
  });
});

describe('duplicate', () => {
  it('copies the scissor sweep into drafts "-copie" and "-copie-2"', async () => {
    const source = await prisma.technique.findUniqueOrThrow({
      where: { slug: SCISSOR },
      include: { tags: true },
    });
    const sourceAdmin = await getAdmin(source.id);

    const first = await call('POST', `/api/admin/techniques/${source.id}/duplicate`);
    expect(first.statusCode).toBe(201);
    const copy = adminTechniqueSchema.parse(first.json());
    expect(copy).toMatchObject({ slug: `${SCISSOR}-copie`, status: 'draft', version: 1 });
    expect(copy.name).toBe(`${sourceAdmin.name} (copie)`);
    expect(copy.steps).toEqual(sourceAdmin.steps);
    expect(copy.tagIds).toEqual(sourceAdmin.tagIds);
    expect(copy.keyPoints).toEqual(sourceAdmin.keyPoints);
    expect(copy.chains).toEqual([]);
    expect(await publicStatus(copy.slug)).toBe(404);

    const second = adminTechniqueSchema.parse(
      (await call('POST', `/api/admin/techniques/${source.id}/duplicate`)).json(),
    );
    expect(second.slug).toBe(`${SCISSOR}-copie-2`);
    expect(second.name).toBe(`${sourceAdmin.name} (copie 2)`);
    // The source is untouched.
    expect((await getAdmin(source.id)).version).toBe(sourceAdmin.version);
  });

  it('answers 404 / 400 for an unknown or malformed id', async () => {
    expect(
      (await call('POST', '/api/admin/techniques/00000000-0000-4000-8000-000000000000/duplicate'))
        .statusCode,
    ).toBe(404);
    expect((await call('POST', '/api/admin/techniques/nope/duplicate')).statusCode).toBe(400);
  });
});

describe('DELETE', () => {
  it('refuses a published technique, deletes a draft with its steps and chains', async () => {
    const published = await make({ status: 'published', stepCount: 2, keyPoints: ['x'] });
    const refused = await call('DELETE', `/api/admin/techniques/${published.id}`);
    expect(refused.statusCode).toBe(409);
    expect(reason(refused)).toBe('still_published');

    const draft = await make({ stepCount: 2 });
    await prisma.chain.create({ data: { fromId: draft.id, toId: published.id, type: 'followup' } });
    await prisma.chain.create({ data: { fromId: published.id, toId: draft.id, type: 'counter' } });
    const done = await call('DELETE', `/api/admin/techniques/${draft.id}`);
    expect(done.statusCode).toBe(204);
    expect(done.body).toBe('');
    expect((await call('GET', `/api/admin/techniques/${draft.id}`)).statusCode).toBe(404);
    expect(await prisma.step.count({ where: { techniqueId: draft.id } })).toBe(0);
    expect(
      await prisma.chain.count({ where: { OR: [{ fromId: draft.id }, { toId: draft.id }] } }),
    ).toBe(0);
    expect((await call('DELETE', `/api/admin/techniques/${draft.id}`)).statusCode).toBe(404);
  });

  it('refuses a body on the routes that take none (JSON, empty object, text/plain)', async () => {
    const { id, slug } = await make({ stepCount: 2 });
    for (const [method, url] of [
      ['DELETE', `/api/admin/techniques/${id}`],
      ['POST', `/api/admin/techniques/${id}/duplicate`],
    ] as const) {
      const bodies = [
        { payload: { version: 1 } },
        { payload: {} },
        { payload: 'hello', headers: { 'content-type': 'text/plain' } },
      ];
      for (const { payload, headers } of bodies) {
        const res = await app.inject({
          method,
          url,
          headers: { origin: ORIGIN, cookie, ...headers },
          payload: payload as object | string,
        });
        expect(res.statusCode, `${method} ${url}`).toBe(400);
        expect(apiErrorSchema.parse(res.json()).error.code).toBe('bad_request');
      }
    }
    // Nothing was done: still there, no copy made.
    expect(await prisma.technique.count({ where: { id } })).toBe(1);
    expect(await prisma.technique.count({ where: { slug: `${slug}-copie` } })).toBe(0);
    // Without a body they still work.
    const copy = await call('POST', `/api/admin/techniques/${id}/duplicate`);
    expect(copy.statusCode).toBe(201);
    created.push(adminTechniqueSchema.parse(copy.json()).id);
    expect((await call('DELETE', `/api/admin/techniques/${id}`)).statusCode).toBe(204);
  });

  it('requires Origin and a session on every write route', async () => {
    const { id } = await make();
    for (const [method, url] of [
      ['DELETE', `/api/admin/techniques/${id}`],
      ['POST', `/api/admin/techniques/${id}/duplicate`],
      ['POST', `/api/admin/techniques/${id}/publish`],
    ] as const) {
      const noOrigin = await app.inject({
        method,
        url,
        headers: { cookie },
        payload: { version: 1 },
      });
      expect(noOrigin.statusCode, url).toBe(403);
      const noSession = await app.inject({
        method,
        url,
        headers: { origin: ORIGIN },
        payload: { version: 1 },
      });
      expect(noSession.statusCode, url).toBe(401);
    }
    expect(await prisma.technique.count({ where: { id } })).toBe(1);
  });
});
