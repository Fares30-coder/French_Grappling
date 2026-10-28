import {
  type AdminTechnique,
  type AdminTechniqueListItem,
  adminTechniqueListSchema,
  adminTechniqueSchema,
  poseSchema,
  upgradePose,
} from '@tatamap/shared';
import type { AdminListRow, AdminTechniqueRow } from './admin-technique-repository';

/** Maps a DB row to the admin contract; poses go through poseSchema + upgradePose, output is parsed. */
export function toAdminTechnique(row: AdminTechniqueRow): AdminTechnique {
  return adminTechniqueSchema.parse({
    id: row.id,
    version: row.version,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    slug: row.slug,
    name: row.name,
    category: row.category,
    level: row.level,
    gi: row.gi,
    keyPoints: row.keyPoints,
    commonMistakes: row.commonMistakes,
    startPositionId: row.startPositionId,
    endPositionId: row.endPositionId,
    tagIds: row.tags.map((t) => t.id),
    steps: row.steps.map((s) => ({
      title: s.title,
      text: s.text,
      transitionMs: s.transitionMs,
      pose: upgradePose(poseSchema.parse(s.pose)),
    })),
    chains: row.chainsFrom.map((c) => ({ toId: c.toId, type: c.type })),
  });
}

export function toAdminTechniqueList(rows: ReadonlyArray<AdminListRow>): AdminTechniqueListItem[] {
  return adminTechniqueListSchema.parse(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      category: r.category,
      status: r.status,
      stepCount: r._count.steps,
      startPositionName: r.startPosition.name,
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
}
