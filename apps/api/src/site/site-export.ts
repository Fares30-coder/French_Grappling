import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { techniqueSlugParamsSchema } from '@tatamap/shared';
import {
  findPositionsWithCounts,
  findPublicTags,
  findPublishedEdges,
  findPublishedTechniques,
} from '../catalog/catalog-repository';
import { toGraph, toPositionList, toTagList, toTechniqueList } from '../catalog/to-catalog';
import type { PrismaClient } from '../generated/prisma/client';
import { findPublishedTechnique } from '../techniques/technique-repository';
import { toTechniqueDetail } from '../techniques/to-technique-detail';

export type SiteExportResult = { techniques: number; positions: number; tags: number };

/**
 * Writes the public data as static JSON files (ADR 0006 D2): the same mappers as the public API
 * routes, so the files equal the responses (and are validated by the same Zod schemas). Only
 * published techniques are exported. `include` restricts the techniques (tests share a database).
 * `outDir` is the `data/v1` folder; its previous content is replaced.
 */
export async function exportSite(
  prisma: PrismaClient,
  outDir: string,
  include: (slug: string) => boolean = () => true,
): Promise<SiteExportResult> {
  const rows = (await findPublishedTechniques(prisma, {})).filter((r) => include(r.slug));
  const list = toTechniqueList(rows, undefined);
  const [positions, edges, tags] = await Promise.all([
    findPositionsWithCounts(prisma),
    findPublishedEdges(prisma),
    findPublicTags(prisma),
  ]);
  const publishedEdges = edges.filter((e) => include(e.slug));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'techniques'), { recursive: true });
  const write = (name: string, data: unknown) =>
    writeFile(join(outDir, name), `${JSON.stringify(data)}\n`);

  for (const item of list.techniques) {
    // The slug becomes a file name: refuse anything the slug rules would not allow.
    const { slug } = techniqueSlugParamsSchema.parse({ slug: item.slug });
    const row = await findPublishedTechnique(prisma, slug);
    if (!row) throw new Error(`Technique ${slug} is no longer published`);
    await write(`techniques/${slug}.json`, toTechniqueDetail(row));
  }
  await write('techniques.json', list);
  await write('positions.json', toPositionList(positions));
  await write('graph.json', toGraph(positions, publishedEdges));
  await write('tags.json', toTagList(tags));
  return { techniques: list.techniques.length, positions: positions.length, tags: tags.length };
}
