import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  graphSchema,
  positionListSchema,
  STARTER_POSE,
  tagListSchema,
  techniqueDetailSchema,
  techniqueListSchema,
} from '@tatamap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../db';
import { toStepCreateData } from '../techniques/step-data';
import { uniqueSlug } from '../test-utils';
import { exportSite } from './site-export';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const prefix = uniqueSlug('site');
const mine = (slug: string) => slug.startsWith(prefix);
let out = '';

const read = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(join(out, name), 'utf8'));

beforeAll(async () => {
  out = join(await mkdtemp(join(tmpdir(), 'tatamap-site-')), 'v1');
  const start = await prisma.position.create({
    data: { slug: `${prefix}-guard`, name: 'Garde', description: '', role: 'bottom' },
  });
  const make = (slug: string, status: 'published' | 'draft') =>
    prisma.technique.create({
      data: {
        slug,
        name: slug,
        category: 'submission',
        level: 'beginner',
        gi: 'both',
        status,
        startPositionId: start.id,
      },
    });
  const published = await make(`${prefix}-pub`, 'published');
  const draft = await make(`${prefix}-draft`, 'draft');
  const step = [{ title: 'A', text: '', transitionMs: 1000, pose: STARTER_POSE }];
  await prisma.step.createMany({ data: toStepCreateData(published.id, step) });
  await prisma.step.createMany({ data: toStepCreateData(draft.id, step) });
});

afterAll(async () => {
  await prisma.technique.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.position.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
  await rm(join(out, '..'), { recursive: true, force: true });
});

describe('exportSite', () => {
  it('writes schema-valid files, published techniques only, one file per slug', async () => {
    const result = await exportSite(prisma, out, mine);
    expect(result.techniques).toBe(1);

    const list = techniqueListSchema.parse(await read('techniques.json'));
    expect(list.techniques.map((t) => t.slug)).toEqual([`${prefix}-pub`]);
    positionListSchema.parse(await read('positions.json'));
    tagListSchema.parse(await read('tags.json'));
    const graph = graphSchema.parse(await read('graph.json'));
    expect(graph.edges.map((e) => e.technique.slug)).toEqual([`${prefix}-pub`]);

    expect(await readdir(join(out, 'techniques'))).toEqual([`${prefix}-pub.json`]);
    const detail = techniqueDetailSchema.parse(await read(`techniques/${prefix}-pub.json`));
    expect(detail.steps).toHaveLength(1);
    expect(detail.steps[0]?.pose.skeleton).toBe('v2-21');
  });

  it('replaces the previous export', async () => {
    await exportSite(prisma, out, () => false);
    expect(await readdir(join(out, 'techniques'))).toEqual([]);
  });
});
