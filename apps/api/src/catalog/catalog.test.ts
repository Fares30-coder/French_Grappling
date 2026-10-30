import {
  apiErrorSchema,
  graphSchema,
  positionListSchema,
  STARTER_POSE,
  tagListSchema,
  techniqueListSchema,
} from '@tatamap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../db';
import { PUBLIC_CACHE_CONTROL } from '../routes/techniques';
import { toStepCreateData } from '../techniques/step-data';
import { buildTestApp, uniqueSlug } from '../test-utils';

// Integration tests on the test database. Other files create techniques in parallel, so every
// assertion is scoped to this file's own rows (a unique token in their names).
const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = await buildTestApp(prisma);
const token = uniqueSlug('zq');
const created: { techniques: string[]; tags: string[] } = { techniques: [], tags: [] };

async function createTechnique(data: {
  name: string;
  category: 'submission' | 'sweep';
  level: 'beginner' | 'intermediate';
  gi: 'gi' | 'nogi' | 'both';
  status: 'draft' | 'published';
  end?: string;
  tagId?: string;
  steps: number;
}) {
  const start = await prisma.position.findUniqueOrThrow({ where: { slug: 'garde-fermee' } });
  const end = data.end
    ? await prisma.position.findUniqueOrThrow({ where: { slug: data.end } })
    : null;
  const t = await prisma.technique.create({
    data: {
      slug: uniqueSlug('cat'),
      name: data.name,
      category: data.category,
      level: data.level,
      gi: data.gi,
      status: data.status,
      startPositionId: start.id,
      endPositionId: end?.id ?? null,
      ...(data.tagId ? { tags: { connect: { id: data.tagId } } } : {}),
    },
  });
  const steps = Array.from({ length: data.steps }, (_, i) => ({
    title: `Étape ${i + 1}`,
    text: '',
    transitionMs: 1300,
    pose: STARTER_POSE,
  }));
  await prisma.step.createMany({ data: toStepCreateData(t.id, steps) });
  created.techniques.push(t.id);
  return t;
}

const list = async (query: string) => {
  const res = await app.inject({ method: 'GET', url: `/api/techniques?${query}` });
  return { res, body: res.statusCode === 200 ? techniqueListSchema.parse(res.json()) : null };
};
const names = (body: { techniques: Array<{ name: string }> } | null) =>
  body?.techniques.map((t) => t.name);

beforeAll(async () => {
  const tag = await prisma.tag.create({ data: { slug: uniqueSlug('ete'), name: `Été ${token}` } });
  const draftTag = await prisma.tag.create({
    data: { slug: uniqueSlug('brouillon'), name: `Caché ${token}` },
  });
  created.tags.push(tag.id, draftTag.id);
  await createTechnique({
    name: `Renversement ${token}`,
    category: 'sweep',
    level: 'intermediate',
    gi: 'nogi',
    status: 'published',
    end: 'montee',
    tagId: tag.id,
    steps: 3,
  });
  await createTechnique({
    name: `Clé ${token}`,
    category: 'submission',
    level: 'beginner',
    gi: 'gi',
    status: 'published',
    steps: 2,
  });
  await createTechnique({
    name: `Brouillon ${token}`,
    category: 'submission',
    level: 'beginner',
    gi: 'both',
    status: 'draft',
    tagId: draftTag.id,
    steps: 1,
  });
});

afterAll(async () => {
  await prisma.technique.deleteMany({ where: { id: { in: created.techniques } } });
  await prisma.tag.deleteMany({ where: { id: { in: created.tags } } });
  await app.close();
  await prisma.$disconnect();
});

describe('GET /api/techniques', () => {
  it('lists published techniques only, sorted by name, with their preview', async () => {
    const { res, body } = await list(`q=${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
    expect(names(body)).toEqual([`Clé ${token}`, `Renversement ${token}`]);
    const sweep = body?.techniques[1];
    expect(sweep?.stepCount).toBe(3);
    expect(sweep?.endPosition?.slug).toBe('montee');
    expect(sweep?.tags.map((t) => t.name)).toEqual([`Été ${token}`]);
    expect(sweep?.preview.skeleton).toBe('v1-11');
    expect(body?.techniques[0]?.endPosition).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/"id"/);
  });

  it('searches names and tags, ignoring accents and case', async () => {
    expect(names((await list(`q=${encodeURIComponent(`CLE ${token}`)}`)).body)).toEqual([
      `Clé ${token}`,
    ]);
    expect(names((await list(`q=${encodeURIComponent(`ete ${token}`)}`)).body)).toEqual([
      `Renversement ${token}`,
    ]);
    // A tag only used by a draft finds nothing.
    expect(names((await list(`q=${encodeURIComponent(`cache ${token}`)}`)).body)).toEqual([]);
  });

  it('filters by category, level, gi and start position', async () => {
    expect(names((await list(`q=${token}&categorie=sweep`)).body)).toEqual([
      `Renversement ${token}`,
    ]);
    expect(names((await list(`q=${token}&niveau=beginner`)).body)).toEqual([`Clé ${token}`]);
    expect(names((await list(`q=${token}&gi=gi`)).body)).toEqual([`Clé ${token}`]);
    expect(names((await list(`q=${token}&gi=nogi`)).body)).toEqual([`Renversement ${token}`]);
    expect(names((await list(`q=${token}&gi=both`)).body)).toEqual([]);
    expect(names((await list(`q=${token}&position=garde-fermee`)).body)).toHaveLength(2);
    expect(names((await list(`q=${token}&position=montee`)).body)).toEqual([]);
  });

  it('includes techniques done in both for gi=gi', async () => {
    const both = await createTechnique({
      name: `Les deux ${token}`,
      category: 'submission',
      level: 'beginner',
      gi: 'both',
      status: 'published',
      steps: 1,
    });
    expect(names((await list(`q=${token}&gi=gi`)).body)).toContain(both.name);
    expect(names((await list(`q=${token}&gi=nogi`)).body)).toContain(both.name);
    await prisma.technique.delete({ where: { id: both.id } });
  });

  it('rejects an invalid filter with 400', async () => {
    const { res } = await list('categorie=soumission');
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('bad_request');
  });
});

describe('GET /api/positions, /api/graph, /api/tags', () => {
  it('lists every position with its published technique count', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/positions' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
    const { positions } = positionListSchema.parse(res.json());
    const closed = positions.find((p) => p.slug === 'garde-fermee');
    expect(closed?.techniqueCount).toBeGreaterThanOrEqual(2);
    expect(positions.find((p) => p.slug === 'montee')).toBeDefined();
    const sorted = [...positions].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    expect(positions).toEqual(sorted);
  });

  it('returns the graph: submissions end nowhere, drafts are absent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/graph' });
    expect(res.statusCode).toBe(200);
    const graph = graphSchema.parse(res.json());
    const mine = graph.edges.filter((e) => e.technique.name.endsWith(token));
    expect(mine.map((e) => [e.technique.name, e.from, e.to])).toEqual([
      [`Clé ${token}`, 'garde-fermee', null],
      [`Renversement ${token}`, 'garde-fermee', 'montee'],
    ]);
    const slugs = new Set(graph.nodes.map((n) => n.slug));
    expect(graph.edges.every((e) => slugs.has(e.from) && (e.to === null || slugs.has(e.to)))).toBe(
      true,
    );
  });

  it('lists only tags used by a published technique', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(res.statusCode).toBe(200);
    const names = tagListSchema.parse(res.json()).tags.map((t) => t.name);
    expect(names).toContain(`Été ${token}`);
    expect(names).not.toContain(`Caché ${token}`);
  });
});
