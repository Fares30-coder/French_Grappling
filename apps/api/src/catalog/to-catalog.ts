import {
  type Graph,
  graphSchema,
  matchesSearch,
  type PositionList,
  poseSchema,
  positionListSchema,
  type TagList,
  type TechniqueList,
  tagListSchema,
  techniqueListSchema,
  upgradePose,
} from '@tatamap/shared';
import type { EdgeRow, PositionCountRow, TechniqueListRow } from './catalog-repository';

const byName = <T extends { name: string }>(a: T, b: T): number =>
  a.name.localeCompare(b.name, 'fr');

const toPositionSummary = (p: { slug: string; name: string; role: PositionCountRow['role'] }) => ({
  slug: p.slug,
  name: p.name,
  role: p.role,
});

const matches = (row: TechniqueListRow, q: string | undefined): boolean =>
  matchesSearch([row.name, ...row.tags.map((t) => t.name)], q);

/** Maps rows to the public list, filtered by `q`, sorted by name; validated like the detail. */
export function toTechniqueList(rows: TechniqueListRow[], q: string | undefined): TechniqueList {
  return techniqueListSchema.parse({
    techniques: rows
      .filter((row) => matches(row, q))
      .sort(byName)
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        category: row.category,
        level: row.level,
        gi: row.gi,
        startPosition: toPositionSummary(row.startPosition),
        endPosition: row.endPosition ? toPositionSummary(row.endPosition) : null,
        tags: row.tags.map((t) => ({ slug: t.slug, name: t.name })).sort(byName),
        stepCount: row._count.steps,
        preview: upgradePose(poseSchema.parse(row.steps[0]?.pose)),
      })),
  });
}

const toPositionItem = (p: PositionCountRow) => ({
  ...toPositionSummary(p),
  description: p.description,
  techniqueCount: p._count.techniquesFrom,
});

export function toPositionList(rows: PositionCountRow[]): PositionList {
  return positionListSchema.parse({ positions: [...rows].sort(byName).map(toPositionItem) });
}

export function toGraph(positions: PositionCountRow[], edges: EdgeRow[]): Graph {
  return graphSchema.parse({
    nodes: [...positions].sort(byName).map(toPositionItem),
    edges: [...edges].sort(byName).map((e) => ({
      technique: { slug: e.slug, name: e.name, category: e.category, level: e.level, gi: e.gi },
      from: e.startPosition.slug,
      to: e.endPosition?.slug ?? null,
    })),
  });
}

export function toTagList(rows: Array<{ slug: string; name: string }>): TagList {
  return tagListSchema.parse({ tags: [...rows].sort(byName) });
}
