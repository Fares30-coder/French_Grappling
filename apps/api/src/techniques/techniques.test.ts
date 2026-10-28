import { apiErrorSchema, techniqueDetailSchema } from '@tatamap/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createPrisma } from '../db';

// Integration tests: need a migrated and seeded database (pnpm db:seed).
const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const app = buildApp({ prisma });

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

  it('returns 400 for an invalid slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/techniques/Pas_Un_Slug' });
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('bad_request');
  });
});
