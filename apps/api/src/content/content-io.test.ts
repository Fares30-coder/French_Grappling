import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CameraHint, mirrorPose, STARTER_POSE, type StepInput } from '@tatamap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../db';
import { toStepCreateData } from '../techniques/step-data';
import { uniqueSlug } from '../test-utils';
import { ContentDirError, resolveContentDir } from './content-dir';
import { ContentError, exportContent, importContent } from './content-io';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
// Everything this file creates carries the prefix; the export is restricted to it, so parallel
// test files writing to the same database cannot interfere.
const prefix = uniqueSlug('content');
const mine = (slug: string) => slug.startsWith(prefix);
const temps: string[] = [];
const tmp = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tatamap-content-'));
  temps.push(dir);
  return dir;
};

async function wipe(): Promise<void> {
  await prisma.technique.deleteMany({ where: { slug: { startsWith: prefix } } }); // cascades
  await prisma.tag.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.position.deleteMany({ where: { slug: { startsWith: prefix } } });
}

/** All files of a content folder, by relative path. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const name of ['positions.json', 'tags.json'])
    files[name] = await readFile(join(dir, name), 'utf8');
  for (const name of await readdir(join(dir, 'techniques'))) {
    files[`techniques/${name}`] = await readFile(join(dir, 'techniques', name), 'utf8');
  }
  return files;
}

const counts = async () => ({
  positions: await prisma.position.count({ where: { slug: { startsWith: prefix } } }),
  tags: await prisma.tag.count({ where: { slug: { startsWith: prefix } } }),
  techniques: await prisma.technique.count({ where: { slug: { startsWith: prefix } } }),
  steps: await prisma.step.count({ where: { technique: { slug: { startsWith: prefix } } } }),
  chains: await prisma.chain.count({ where: { from: { slug: { startsWith: prefix } } } }),
});

beforeAll(async () => {
  await wipe();
  const start = await prisma.position.create({
    data: { slug: `${prefix}-guard`, name: 'Garde de test', description: 'Desc', role: 'bottom' },
  });
  const end = await prisma.position.create({
    data: { slug: `${prefix}-mount`, name: 'Montée de test', description: '', role: 'top' },
  });
  const tagB = await prisma.tag.create({ data: { slug: `${prefix}-b`, name: 'B' } });
  const tagA = await prisma.tag.create({ data: { slug: `${prefix}-a`, name: 'A' } });
  const camera: CameraHint = { position: [100, 120, 200], target: [0, 40, 0] };
  const stepsOf = (n: number): StepInput[] =>
    Array.from({ length: n }, (_, i) => ({
      title: `Étape ${i + 1}`,
      text: i === 0 ? 'Texte avec "guillemets" et accents é' : '',
      transitionMs: 1000 + i * 100,
      pose: i === 1 ? { ...mirrorPose(STARTER_POSE), camera } : STARTER_POSE,
    }));
  const published = await prisma.technique.create({
    data: {
      slug: `${prefix}-sweep`,
      name: 'Renversement de test',
      category: 'sweep',
      level: 'intermediate',
      gi: 'nogi',
      status: 'published',
      publishedAt: new Date('2026-10-01T08:30:00.123Z'),
      keyPoints: ['Un', 'Deux'],
      commonMistakes: ['Erreur'],
      startPositionId: start.id,
      endPositionId: end.id,
      tags: { connect: [{ id: tagB.id }, { id: tagA.id }] },
    },
  });
  const draft = await prisma.technique.create({
    data: {
      slug: `${prefix}-choke`,
      name: 'Étranglement de test',
      category: 'submission',
      level: 'beginner',
      gi: 'both',
      startPositionId: end.id,
    },
  });
  await prisma.step.createMany({ data: toStepCreateData(published.id, stepsOf(3)) });
  await prisma.step.createMany({ data: toStepCreateData(draft.id, stepsOf(1)) });
  await prisma.chain.createMany({
    data: [
      { fromId: published.id, toId: draft.id, type: 'alternative' },
      { fromId: published.id, toId: draft.id, type: 'followup' },
      { fromId: draft.id, toId: published.id, type: 'counter' },
    ],
  });
});

afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
  await Promise.all(temps.map((d) => rm(d, { recursive: true, force: true })));
});

describe('export / import', () => {
  it('export -> wipe -> import -> export gives identical files', async () => {
    const first = await tmp();
    const exported = await exportContent(prisma, first, mine);
    expect(exported).toMatchObject({ positions: 2, tags: 2, techniques: 2, removed: [] });
    const before = await counts();
    const files = await snapshot(first);

    // Sorted by slug, 2-space indent, final newline, no ids or version.
    expect(Object.keys(files).sort()).toEqual([
      'positions.json',
      'tags.json',
      `techniques/${prefix}-choke.json`,
      `techniques/${prefix}-sweep.json`,
    ]);
    const sweep = files[`techniques/${prefix}-sweep.json`] ?? '';
    expect(sweep.endsWith('}\n')).toBe(true);
    expect(sweep).toContain('\n  "slug": ');
    expect(sweep).not.toMatch(/"(id|version|updatedAt)"/);
    expect((JSON.parse(files['tags.json'] ?? '') as { slug: string }[]).map((t) => t.slug)).toEqual(
      [`${prefix}-a`, `${prefix}-b`],
    );
    const parsed = JSON.parse(sweep) as { chains: { type: string }[]; tags: string[] };
    expect(parsed.chains.map((c) => c.type)).toEqual(['followup', 'alternative']);
    expect(parsed.tags).toEqual([`${prefix}-a`, `${prefix}-b`]);

    await wipe();
    expect((await counts()).techniques).toBe(0);
    const imported = await importContent(prisma, first);
    expect(imported).toEqual({ positions: 2, tags: 2, techniques: 2 });
    expect(await counts()).toEqual(before);

    const second = await tmp();
    await exportContent(prisma, second, mine);
    expect(await snapshot(second)).toEqual(files);

    // Status and publication date survive.
    const row = await prisma.technique.findUniqueOrThrow({ where: { slug: `${prefix}-sweep` } });
    expect(row.status).toBe('published');
    expect(row.publishedAt?.toISOString()).toBe('2026-10-01T08:30:00.123Z');
  });

  it('importing twice creates no duplicate', async () => {
    const dir = await tmp();
    await exportContent(prisma, dir, mine);
    const before = await counts();
    await importContent(prisma, dir);
    await importContent(prisma, dir);
    expect(await counts()).toEqual(before);
  });

  it('removes the files of techniques that no longer exist', async () => {
    const dir = await tmp();
    await exportContent(prisma, dir, mine);
    await writeFile(join(dir, 'techniques', `${prefix}-gone.json`), '{}\n');
    await writeFile(join(dir, 'techniques', 'someone-elses.json'), '{}\n');
    const result = await exportContent(prisma, dir, mine);
    expect(result.removed).toEqual([`${prefix}-gone.json`]);
    expect(await readdir(join(dir, 'techniques'))).toContain('someone-elses.json');
  });

  it('writes nothing when a file is invalid (pose with 10 joints)', async () => {
    const good = await tmp();
    await exportContent(prisma, good, mine);
    const bad = await tmp();
    await cp(good, bad, { recursive: true });

    // A valid change to one technique, and a broken pose in the other.
    const choke = join(bad, 'techniques', `${prefix}-choke.json`);
    const chokeData = JSON.parse(await readFile(choke, 'utf8')) as { name: string };
    chokeData.name = 'Renamed by the import';
    await writeFile(choke, JSON.stringify(chokeData));
    const sweepPath = join(bad, 'techniques', `${prefix}-sweep.json`);
    const sweep = JSON.parse(await readFile(sweepPath, 'utf8')) as {
      steps: { pose: { fighters: { me: Record<string, unknown> } } }[];
    };
    delete sweep.steps[0]?.pose.fighters.me.footR;
    await writeFile(sweepPath, JSON.stringify(sweep));

    const before = await counts();
    const error = await importContent(prisma, bad).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContentError);
    expect((error as ContentError).problems.join('\n')).toContain(`${prefix}-sweep.json`);
    expect(await counts()).toEqual(before);
    const row = await prisma.technique.findUniqueOrThrow({ where: { slug: `${prefix}-choke` } });
    expect(row.name).toBe('Étranglement de test');
  });

  it('reports unknown references and a mismatching file name, all at once', async () => {
    const dir = await tmp();
    await exportContent(prisma, dir, mine);
    await writeFile(join(dir, 'tags.json'), '[]\n'); // the sweep uses two tags
    await cp(
      join(dir, 'techniques', `${prefix}-choke.json`),
      join(dir, 'techniques', 'wrong-name.json'),
    );
    const error = (await importContent(prisma, dir).catch((e: unknown) => e)) as ContentError;
    expect(error).toBeInstanceOf(ContentError);
    const text = error.problems.join('\n');
    expect(text).toContain(`unknown tag "${prefix}-a"`);
    expect(text).toContain('wrong-name.json: the file name must be');
  });
});

describe('resolveContentDir', () => {
  it('defaults to content/ at the repo root and honours CONTENT_DIR', async () => {
    const root = await tmp();
    await expect(async () => resolveContentDir({}, root)).rejects.toThrow(ContentDirError);
    const dir = join(root, 'content');
    await import('node:fs/promises').then((fs) => fs.mkdir(dir));
    expect(resolveContentDir({}, root)).toBe(dir);
    const other = join(root, 'elsewhere');
    await import('node:fs/promises').then((fs) => fs.mkdir(other));
    expect(resolveContentDir({ CONTENT_DIR: 'elsewhere' }, root)).toBe(other);
    expect(resolveContentDir({ CONTENT_DIR: other }, root)).toBe(other);
  });

  it('explains how to get the private repository when the folder is missing', async () => {
    const root = await tmp();
    expect(() => resolveContentDir({}, root)).toThrow(/Fares30-coder\/tatamap-content/);
    expect(() => resolveContentDir({}, root)).toThrow(/git clone/);
  });
});
