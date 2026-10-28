import {
  poseSchema,
  type TechniqueDetail,
  type TechniqueSummary,
  techniqueDetailSchema,
  upgradePose,
} from '@tatamap/shared';
import type { Position, Technique } from '../generated/prisma/client';
import type { TechniqueRow } from './technique-repository';

const toPositionSummary = (p: Position) => ({ slug: p.slug, name: p.name, role: p.role });

const toSummary = (t: Technique): TechniqueSummary => ({
  slug: t.slug,
  name: t.name,
  category: t.category,
  level: t.level,
  gi: t.gi,
});

/** Maps a DB row to the public contract. Never exposes ids; upgrades poses to the current skeleton. */
export function toTechniqueDetail(row: TechniqueRow): TechniqueDetail {
  return techniqueDetailSchema.parse({
    ...toSummary(row),
    keyPoints: row.keyPoints,
    commonMistakes: row.commonMistakes,
    startPosition: toPositionSummary(row.startPosition),
    endPosition: row.endPosition ? toPositionSummary(row.endPosition) : null,
    tags: row.tags
      .map((t) => ({ slug: t.slug, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    steps: row.steps.map((s) => ({
      order: s.order,
      title: s.title,
      text: s.text,
      transitionMs: s.transitionMs,
      pose: upgradePose(poseSchema.parse(s.pose)),
    })),
    chains: row.chainsFrom.map((c) => ({ type: c.type, technique: toSummary(c.to) })),
  });
}
