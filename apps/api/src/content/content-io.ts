import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CHAIN_TYPES,
  type ContentPosition,
  type ContentTag,
  type ContentTechnique,
  contentPositionsFileSchema,
  contentTagsFileSchema,
  contentTechniqueSchema,
  poseSchema,
  upgradePose,
} from '@tatamap/shared';
import type { z } from 'zod';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { toStepCreateData } from '../techniques/step-data';
import { toTechniqueWriteData } from '../techniques/technique-write';

/** Thrown when the files are invalid; `problems` lists every one, so nothing is written. */
export class ContentError extends Error {
  constructor(readonly problems: ReadonlyArray<string>) {
    super(`Invalid content:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
}

export type ContentBundle = {
  positions: ContentPosition[];
  tags: ContentTag[];
  techniques: ContentTechnique[];
};

/** Restricts an export to some slugs (tests work on their own rows of a shared database). */
export type SlugFilter = (slug: string) => boolean;

const POSITIONS_FILE = 'positions.json';
const TAGS_FILE = 'tags.json';
const TECHNIQUES_DIR = 'techniques';

/** 2-space indent and a final newline: stable, readable git diffs. */
const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const bySlug = <T extends { slug: string }>(a: T, b: T): number =>
  a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;

// ---------------------------------------------------------------- export

const exportInclude = {
  startPosition: { select: { slug: true } },
  endPosition: { select: { slug: true } },
  tags: { select: { slug: true } },
  steps: { orderBy: { order: 'asc' } },
  chainsFrom: { include: { to: { select: { slug: true } } } },
} satisfies Prisma.TechniqueInclude;

type ExportRow = Prisma.TechniqueGetPayload<{ include: typeof exportInclude }>;

const chainRank = (type: string): number =>
  CHAIN_TYPES.indexOf(type as (typeof CHAIN_TYPES)[number]);

/** Row -> content model. Poses go through poseSchema + upgradePose; the output is parsed (and so canonically ordered). */
function toContentTechnique(row: ExportRow): ContentTechnique {
  return contentTechniqueSchema.parse({
    slug: row.slug,
    name: row.name,
    category: row.category,
    level: row.level,
    gi: row.gi,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    startPosition: row.startPosition.slug,
    endPosition: row.endPosition?.slug ?? null,
    keyPoints: row.keyPoints,
    commonMistakes: row.commonMistakes,
    tags: row.tags.map((t) => t.slug).sort(),
    steps: row.steps.map((s) => ({
      title: s.title,
      text: s.text,
      transitionMs: s.transitionMs,
      pose: upgradePose(poseSchema.parse(s.pose)),
    })),
    chains: row.chainsFrom
      .map((c) => ({ to: c.to.slug, type: c.type }))
      .sort(
        (a, b) => chainRank(a.type) - chainRank(b.type) || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0),
      ),
  });
}

/**
 * Writes positions.json, tags.json and techniques/<slug>.json into `dir` (which must exist), sorted
 * and formatted for stable diffs. Technique files of techniques that no longer exist are removed,
 * so the folder mirrors the database.
 */
export async function exportContent(
  prisma: PrismaClient,
  dir: string,
  filter: SlugFilter = () => true,
): Promise<{ positions: number; tags: number; techniques: number; removed: string[] }> {
  const [positionRows, tagRows, techniqueRows] = await Promise.all([
    prisma.position.findMany(),
    prisma.tag.findMany(),
    prisma.technique.findMany({ include: exportInclude }),
  ]);
  const positions = contentPositionsFileSchema.parse(
    positionRows
      .filter((p) => filter(p.slug))
      .map((p) => ({ slug: p.slug, name: p.name, description: p.description, role: p.role }))
      .sort(bySlug),
  );
  const tags = contentTagsFileSchema.parse(
    tagRows
      .filter((t) => filter(t.slug))
      .map((t) => ({ slug: t.slug, name: t.name }))
      .sort(bySlug),
  );
  const techniques = techniqueRows
    .filter((t) => filter(t.slug))
    .map(toContentTechnique)
    .sort(bySlug);

  const techniquesDir = join(dir, TECHNIQUES_DIR);
  await mkdir(techniquesDir, { recursive: true });
  await writeFile(join(dir, POSITIONS_FILE), toJson(positions));
  await writeFile(join(dir, TAGS_FILE), toJson(tags));
  for (const technique of techniques) {
    await writeFile(join(techniquesDir, `${technique.slug}.json`), toJson(technique));
  }
  const kept = new Set(techniques.map((t) => `${t.slug}.json`));
  const removed: string[] = [];
  for (const name of await readdir(techniquesDir)) {
    if (name.endsWith('.json') && !kept.has(name) && filter(name.slice(0, -'.json'.length))) {
      await rm(join(techniquesDir, name));
      removed.push(name);
    }
  }
  return {
    positions: positions.length,
    tags: tags.length,
    techniques: techniques.length,
    removed: removed.sort(),
  };
}

// ---------------------------------------------------------------- read + validate

const describeIssues = (file: string, error: z.ZodError): string[] =>
  error.issues.map((i) => `${file}: ${i.path.join('.') || '(root)'}: ${i.message}`);

async function readJson(
  path: string,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(path, 'utf8')) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { ok: true, value: undefined };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Reads and fully validates the content folder: every file against its schema, then every
 * reference (positions, tags, chain targets) against the files themselves. Throws a ContentError
 * listing all problems; returns nothing to write otherwise.
 */
export async function readContent(dir: string): Promise<ContentBundle> {
  const problems: string[] = [];
  const bundle: ContentBundle = { positions: [], tags: [], techniques: [] };

  for (const [file, schema, assign] of [
    [POSITIONS_FILE, contentPositionsFileSchema, (v: ContentPosition[]) => (bundle.positions = v)],
    [TAGS_FILE, contentTagsFileSchema, (v: ContentTag[]) => (bundle.tags = v)],
  ] as const) {
    const json = await readJson(join(dir, file));
    if (!json.ok) problems.push(`${file}: ${json.error}`);
    else if (json.value !== undefined) {
      const parsed = schema.safeParse(json.value);
      if (parsed.success) (assign as (v: unknown) => unknown)(parsed.data);
      else problems.push(...describeIssues(file, parsed.error));
    }
  }

  const techniquesDir = join(dir, TECHNIQUES_DIR);
  let names: string[] = [];
  try {
    names = (await readdir(techniquesDir)).filter((n) => n.endsWith('.json')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const name of names) {
    const file = `${TECHNIQUES_DIR}/${name}`;
    const json = await readJson(join(techniquesDir, name));
    if (!json.ok) {
      problems.push(`${file}: ${json.error}`);
      continue;
    }
    const parsed = contentTechniqueSchema.safeParse(json.value);
    if (!parsed.success) {
      problems.push(...describeIssues(file, parsed.error));
    } else if (`${parsed.data.slug}.json` !== name) {
      problems.push(`${file}: the file name must be ${parsed.data.slug}.json`);
    } else {
      bundle.techniques.push(parsed.data);
    }
  }

  const positions = new Set(bundle.positions.map((p) => p.slug));
  const tags = new Set(bundle.tags.map((t) => t.slug));
  const techniques = new Set(bundle.techniques.map((t) => t.slug));
  for (const t of bundle.techniques) {
    const where = `${TECHNIQUES_DIR}/${t.slug}.json`;
    if (!positions.has(t.startPosition))
      problems.push(`${where}: unknown position "${t.startPosition}"`);
    if (t.endPosition !== null && !positions.has(t.endPosition)) {
      problems.push(`${where}: unknown position "${t.endPosition}"`);
    }
    for (const tag of t.tags) if (!tags.has(tag)) problems.push(`${where}: unknown tag "${tag}"`);
    for (const c of t.chains) {
      if (!techniques.has(c.to)) problems.push(`${where}: unknown chain target "${c.to}"`);
    }
  }
  if (problems.length > 0) throw new ContentError(problems);
  return bundle;
}

// ---------------------------------------------------------------- import

/**
 * Loads the content folder into the database: upsert by slug of positions, tags and techniques
 * (status kept, steps replaced), then the chains, all in one transaction. Techniques that are in
 * the database but not in the folder are left alone. Nothing is written if a file is invalid.
 */
export async function importContent(
  prisma: PrismaClient,
  dir: string,
): Promise<{ positions: number; tags: number; techniques: number }> {
  const bundle = await readContent(dir);

  await prisma.$transaction(
    async (tx) => {
      for (const p of bundle.positions) {
        const data = { name: p.name, description: p.description, role: p.role };
        await tx.position.upsert({
          where: { slug: p.slug },
          create: { slug: p.slug, ...data },
          update: data,
        });
      }
      for (const t of bundle.tags) {
        await tx.tag.upsert({
          where: { slug: t.slug },
          create: { slug: t.slug, name: t.name },
          update: { name: t.name },
        });
      }
      const positionIds = new Map(
        (await tx.position.findMany({ select: { id: true, slug: true } })).map((p) => [
          p.slug,
          p.id,
        ]),
      );
      const tagIds = new Map(
        (await tx.tag.findMany({ select: { id: true, slug: true } })).map((t) => [t.slug, t.id]),
      );
      const idOf = (ids: Map<string, string>, slug: string): string => {
        const id = ids.get(slug);
        if (!id) throw new Error(`unresolved slug ${slug}`); // checked by readContent
        return id;
      };

      const techniqueIds = new Map<string, string>();
      for (const t of bundle.techniques) {
        const fields = {
          ...toTechniqueWriteData({
            slug: t.slug,
            name: t.name,
            category: t.category,
            level: t.level,
            gi: t.gi,
            keyPoints: t.keyPoints,
            commonMistakes: t.commonMistakes,
            startPositionId: idOf(positionIds, t.startPosition),
            endPositionId: t.endPosition === null ? null : idOf(positionIds, t.endPosition),
          }),
          status: t.status,
          publishedAt: t.publishedAt === null ? null : new Date(t.publishedAt),
        };
        const tagConnections = t.tags.map((slug) => ({ id: idOf(tagIds, slug) }));
        const existing = await tx.technique.findUnique({
          where: { slug: t.slug },
          select: { id: true },
        });
        const id = existing
          ? (
              await tx.technique.update({
                where: { id: existing.id },
                data: { ...fields, version: { increment: 1 }, tags: { set: tagConnections } },
                select: { id: true },
              })
            ).id
          : (
              await tx.technique.create({
                data: { ...fields, tags: { connect: tagConnections } },
                select: { id: true },
              })
            ).id;
        techniqueIds.set(t.slug, id);
        await tx.step.deleteMany({ where: { techniqueId: id } });
        await tx.step.createMany({ data: toStepCreateData(id, t.steps) });
      }

      // Chains last: every target exists by now.
      for (const t of bundle.techniques) {
        const fromId = idOf(techniqueIds, t.slug);
        await tx.chain.deleteMany({ where: { fromId } });
        await tx.chain.createMany({
          data: t.chains.map((c) => ({ fromId, toId: idOf(techniqueIds, c.to), type: c.type })),
        });
      }
    },
    { timeout: 60_000 },
  );
  return {
    positions: bundle.positions.length,
    tags: bundle.tags.length,
    techniques: bundle.techniques.length,
  };
}
