import { apiErrorSchema, currentPoseSchema, techniqueDetailSchema } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildScissorPoses } from '../../prisma/seed-data/scissor-sweep';
import { createPrisma } from '../db';
import { buildTestApp } from '../test-utils';
import { toStepCreateData } from './step-data';

// Integration tests: need a migrated and seeded database (pnpm db:seed).
const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = await buildTestApp(prisma);

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('GET /api/techniques/:slug', () => {
  it('returns the seeded scissor sweep', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/techniques/ciseau-garde-fermee' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const t = techniqueDetailSchema.parse(res.json());
    expect(t.steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(t.startPosition.slug).toBe('garde-fermee');
    expect(t.endPosition?.slug).toBe('montee');
    expect(t.tags.map((x) => x.slug)).toEqual(['fondamentaux']);
    expect(JSON.stringify(res.json())).not.toMatch(/"id"/);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/techniques/inconnue' });
    expect(res.statusCode).toBe(404);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('not_found');
  });

  it('returns 404 for a draft technique', async () => {
    const start = await prisma.position.findUniqueOrThrow({ where: { slug: 'garde-fermee' } });
    const draft = await prisma.technique.create({
      data: {
        slug: 'brouillon-test',
        name: 'Brouillon de test',
        category: 'submission',
        level: 'beginner',
        gi: 'both',
        status: 'draft',
        startPositionId: start.id,
      },
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/techniques/brouillon-test' });
      expect(res.statusCode).toBe(404);
      expect(apiErrorSchema.parse(res.json()).error.code).toBe('not_found');
    } finally {
      await prisma.technique.delete({ where: { id: draft.id } });
    }
  });

  it('returns 500 (not 400) when a stored pose is corrupted', async () => {
    const source = await prisma.technique.findUniqueOrThrow({
      where: { slug: 'ciseau-garde-fermee' },
      include: { steps: { orderBy: { order: 'asc' }, take: 1 } },
    });
    const pose = structuredClone(source.steps[0]?.pose) as {
      fighters: { me: { head: number[] } };
    };
    pose.fighters.me.head = [0, 9999, 0]; // y out of bounds
    const corrupted = await prisma.technique.create({
      data: {
        slug: 'pose-corrompue-test',
        name: 'Pose corrompue de test',
        category: 'submission',
        level: 'beginner',
        gi: 'both',
        status: 'published',
        startPositionId: source.startPositionId,
        steps: {
          create: { order: 1, title: 'Etape', skeleton: 'v1-11', pose },
        },
      },
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/techniques/pose-corrompue-test' });
      expect(res.statusCode).toBe(500);
      const parsed = apiErrorSchema.parse(res.json());
      expect(parsed.error.code).toBe('internal');
      expect(res.body).not.toMatch(/9999/);
    } finally {
      await prisma.technique.delete({ where: { id: corrupted.id } });
    }
  });

  it('returns 400 for an invalid slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/techniques/Pas_Un_Slug' });
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('bad_request');
  });

  it('orders chains by type (followup before alternative), whatever the creation order', async () => {
    const start = await prisma.position.findUniqueOrThrow({ where: { slug: 'garde-fermee' } });
    const make = (slug: string) =>
      prisma.technique.create({
        data: {
          slug,
          name: slug,
          category: 'submission',
          level: 'beginner',
          gi: 'both',
          status: 'published',
          startPositionId: start.id,
        },
      });
    const source = await make('chain-source-test');
    await prisma.step.createMany({
      data: toStepCreateData(source.id, [
        {
          title: 'Étape 1',
          text: '',
          transitionMs: 1300,
          pose: currentPoseSchema.parse(buildScissorPoses()[0]),
        },
      ]),
    });
    const alt = await make('chain-alt-test');
    const next = await make('chain-next-test');
    try {
      await prisma.chain.create({ data: { fromId: source.id, toId: alt.id, type: 'alternative' } });
      await prisma.chain.create({ data: { fromId: source.id, toId: next.id, type: 'followup' } });
      const res = await app.inject({ method: 'GET', url: '/api/techniques/chain-source-test' });
      expect(res.statusCode).toBe(200);
      const t = techniqueDetailSchema.parse(res.json());
      expect(t.chains.map((c) => c.type)).toEqual(['followup', 'alternative']);
    } finally {
      await prisma.technique.deleteMany({
        where: { slug: { in: ['chain-source-test', 'chain-alt-test', 'chain-next-test'] } },
      });
    }
  });
});
