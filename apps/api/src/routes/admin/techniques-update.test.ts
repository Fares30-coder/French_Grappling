import {
  type AdminTechnique,
  adminTechniqueSchema,
  apiErrorSchema,
  STARTER_POSE,
  techniqueDetailSchema,
} from '@tatamap/shared';
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
const tagSlug = `upd-tag-${Date.now()}`;
const tag = await prisma.tag.create({ data: { slug: tagSlug, name: 'Tag update test' } });
const scissor = await prisma.technique.findUniqueOrThrow({
  where: { slug: 'ciseau-garde-fermee' },
});

afterAll(async () => {
  await prisma.technique.deleteMany({ where: { id: { in: created } } });
  await prisma.tag.delete({ where: { id: tag.id } });
  await prisma.admin.delete({ where: { id: admin.id } });
  await app.close();
  await prisma.$disconnect();
});

async function make(options: Parameters<typeof createTestTechnique>[1] = {}) {
  const t = await createTestTechnique(prisma, options);
  created.push(t.id);
  return t;
}

const getAdmin = async (id: string): Promise<AdminTechnique> =>
  adminTechniqueSchema.parse(
    (
      await app.inject({ method: 'GET', url: `/api/admin/techniques/${id}`, headers: { cookie } })
    ).json(),
  );

/** The PUT body for a technique as the editor would send it back. */
const toInput = ({
  id: _id,
  status: _s,
  publishedAt: _p,
  updatedAt: _u,
  ...rest
}: AdminTechnique) => rest;

const put = (id: string, payload: unknown) =>
  app.inject({
    method: 'PUT',
    url: `/api/admin/techniques/${id}`,
    headers: { origin: ORIGIN, cookie },
    payload: payload as object,
  });

const reason = (res: { json(): unknown }) => apiErrorSchema.parse(res.json()).error.reason;
const step = (title: string) => ({
  title,
  text: `texte ${title}`,
  transitionMs: 1000,
  pose: STARTER_POSE,
});

describe('PUT /api/admin/techniques/:id', () => {
  it('replaces everything and bumps the version; the GET returns what was sent', async () => {
    const { id } = await make();
    const current = await getAdmin(id);
    const input = {
      ...toInput(current),
      name: 'Nom modifié',
      level: 'advanced',
      keyPoints: ['Point un', 'Point deux'],
      commonMistakes: ['Erreur'],
      tagIds: [tag.id],
      steps: [step('C'), step('A'), step('B')],
      chains: [{ toId: scissor.id, type: 'followup' }],
    };
    const res = await put(id, input);
    expect(res.statusCode).toBe(200);
    const saved = adminTechniqueSchema.parse(res.json());
    expect(saved.version).toBe(current.version + 1);
    const { version: _v, ...sentContent } = input;
    const {
      version: _v2,
      id: _i,
      status: _s,
      publishedAt: _p,
      updatedAt: _u,
      ...stored
    } = await getAdmin(id);
    expect(stored).toEqual(sentContent);
    expect(saved.steps.map((s) => s.title)).toEqual(['C', 'A', 'B']);
  });

  it('refuses the same version twice (version_mismatch)', async () => {
    const { id } = await make();
    const input = toInput(await getAdmin(id));
    expect((await put(id, input)).statusCode).toBe(200);
    const second = await put(id, input);
    expect(second.statusCode).toBe(409);
    expect(reason(second)).toBe('version_mismatch');
  });

  it('lets exactly one of two concurrent saves win', async () => {
    const { id } = await make();
    const input = toInput(await getAdmin(id));
    const results = await Promise.all([
      put(id, { ...input, name: 'Premier' }),
      put(id, { ...input, name: 'Second' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.statusCode === 409);
    expect(loser && reason(loser)).toBe('version_mismatch');
    expect((await getAdmin(id)).version).toBe(input.version + 1);
  });

  it('rejects a chain to itself and unknown references', async () => {
    const { id } = await make();
    const input = toInput(await getAdmin(id));
    const self = await put(id, { ...input, chains: [{ toId: id, type: 'followup' }] });
    expect(self.statusCode).toBe(400);
    expect(reason(self)).toBe('self_chain');
    const ghost = '00000000-0000-4000-8000-000000000000';
    for (const patch of [
      { tagIds: [ghost] },
      { chains: [{ toId: ghost, type: 'counter' }] },
      { startPositionId: ghost },
    ]) {
      const res = await put(id, { ...input, ...patch });
      expect(res.statusCode).toBe(400);
      expect(reason(res)).toBe('unknown_reference');
    }
    expect((await getAdmin(id)).version).toBe(input.version);
  });

  it('answers 409 slug_taken for the slug of another technique', async () => {
    const [a, b] = [await make(), await make()];
    const input = toInput(await getAdmin(a.id));
    const res = await put(a.id, { ...input, slug: b.slug });
    expect(res.statusCode).toBe(409);
    expect(reason(res)).toBe('slug_taken');
    expect((await getAdmin(a.id)).slug).toBe(a.slug);
  });

  it('answers 404 for an unknown id and 400 for a malformed one or an invalid body', async () => {
    const { id } = await make();
    const input = toInput(await getAdmin(id));
    expect((await put('00000000-0000-4000-8000-000000000000', input)).statusCode).toBe(404);
    expect((await put('nope', input)).statusCode).toBe(400);
    expect((await put(id, { ...input, extra: 1 })).statusCode).toBe(400);
  });

  describe('on a published technique', () => {
    it('locks the slug, keeps it publishable, and shows edits publicly', async () => {
      const { id, slug } = await make({ status: 'published', stepCount: 2, keyPoints: ['Point'] });
      const input = toInput(await getAdmin(id));

      const renamed = await put(id, { ...input, slug: `${slug}-bis` });
      expect(renamed.statusCode).toBe(409);
      expect(reason(renamed)).toBe('slug_locked');

      const shrunk = await put(id, { ...input, steps: [step('Seule')] });
      expect(shrunk.statusCode).toBe(409);
      expect(reason(shrunk)).toBe('not_publishable');

      const noPoint = await put(id, { ...input, keyPoints: [] });
      expect(reason(noPoint)).toBe('not_publishable');

      const steps = input.steps.map((s, i) => (i === 0 ? { ...s, title: 'Titre modifié' } : s));
      expect((await put(id, { ...input, steps })).statusCode).toBe(200);
      const pub = await app.inject({ method: 'GET', url: `/api/techniques/${slug}` });
      expect(techniqueDetailSchema.parse(pub.json()).steps[0]?.title).toBe('Titre modifié');
    });
  });

  it('rejects an invalid pose and changes nothing', async () => {
    const { id } = await make({ stepCount: 2 });
    const before = await getAdmin(id);
    const input = toInput(before);

    const extraJoint = structuredClone(input);
    Object.assign(extraJoint.steps[0]?.pose.fighters.me ?? {}, { tail: [0, 0, 0] });
    const negative = structuredClone(input);
    if (negative.steps[1]) negative.steps[1].pose.fighters.opponent.head = [0, -1, 0];

    for (const body of [extraJoint, negative]) {
      expect((await put(id, { ...body, name: 'Ne doit pas passer' })).statusCode).toBe(400);
    }
    const after = await getAdmin(id);
    expect(after).toEqual(before);
  });

  it('stores a chain to a draft but never shows it publicly', async () => {
    const source = await make({ status: 'published', stepCount: 2, keyPoints: ['Point'] });
    const draft = await make();
    const input = toInput(await getAdmin(source.id));
    const res = await put(source.id, { ...input, chains: [{ toId: draft.id, type: 'followup' }] });
    expect(res.statusCode).toBe(200);
    expect((await getAdmin(source.id)).chains).toEqual([{ toId: draft.id, type: 'followup' }]);
    const pub = techniqueDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/api/techniques/${source.slug}` })).json(),
    );
    expect(pub.chains).toEqual([]);
  });

  it('requires Origin and a session', async () => {
    const { id } = await make();
    const input = toInput(await getAdmin(id));
    const noOrigin = await app.inject({
      method: 'PUT',
      url: `/api/admin/techniques/${id}`,
      headers: { cookie },
      payload: input,
    });
    expect(noOrigin.statusCode).toBe(403);
    const noSession = await app.inject({
      method: 'PUT',
      url: `/api/admin/techniques/${id}`,
      headers: { origin: ORIGIN },
      payload: input,
    });
    expect(noSession.statusCode).toBe(401);
  });
});
