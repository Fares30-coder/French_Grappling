import {
  type AdminPosition,
  type AdminTag,
  type AdminTechniqueListItem,
  type PositionSummary,
  type TechniqueDetail,
  techniqueDetailSchema,
} from '@tatamap/shared';
import type { EditorTechnique } from './editor-state';

export type PreviewSources = {
  positions: ReadonlyArray<AdminPosition>;
  tags: ReadonlyArray<AdminTag>;
  /** Every technique (list endpoint): chain targets are resolved from it. */
  techniques: ReadonlyArray<AdminTechniqueListItem>;
};

export type PreviewResult =
  | { ok: true; technique: TechniqueDetail }
  | { ok: false; reason: string };

const toSummary = (p: AdminPosition): PositionSummary => ({
  slug: p.slug,
  name: p.name,
  role: p.role,
});

const cleanList = (items: ReadonlyArray<string>): string[] =>
  items.map((i) => i.trim()).filter((i) => i !== '');

/**
 * Editor state -> the public contract (TechniqueDetail), saved or not, so the preview shows what
 * the public page will look like. Lenient on unfinished input (empty list items are dropped, empty
 * titles get a placeholder, durations are clamped); the result is parsed with the public schema.
 * Like the public API, chains only show targets that are published.
 */
export function toPreview(technique: EditorTechnique, sources: PreviewSources): PreviewResult {
  const start = sources.positions.find((p) => p.id === technique.startPositionId);
  if (!start) return { ok: false, reason: 'Choisis une position de départ.' };
  const end = technique.endPositionId
    ? sources.positions.find((p) => p.id === technique.endPositionId)
    : undefined;
  if (technique.category !== 'submission' && !end) {
    return { ok: false, reason: "Choisis une position d'arrivée." };
  }

  const parsed = techniqueDetailSchema.safeParse({
    slug: technique.slug,
    name: technique.name.trim(),
    category: technique.category,
    level: technique.level,
    gi: technique.gi,
    keyPoints: cleanList(technique.keyPoints),
    commonMistakes: cleanList(technique.commonMistakes),
    startPosition: toSummary(start),
    endPosition: technique.category === 'submission' || !end ? null : toSummary(end),
    tags: technique.tagIds
      .map((id) => sources.tags.find((t) => t.id === id))
      .filter((t): t is AdminTag => t !== undefined)
      .map((t) => ({ slug: t.slug, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    steps: technique.steps.map((s, i) => ({
      order: i + 1,
      title: s.title.trim() || '(sans titre)',
      text: s.text,
      transitionMs: Math.min(10_000, Math.max(100, Math.round(s.transitionMs) || 100)),
      pose: s.pose,
    })),
    chains: technique.chains
      .map((c) => ({ chain: c, target: sources.techniques.find((t) => t.id === c.toId) }))
      .filter(({ target }) => target?.status === 'published')
      .map(({ chain, target }) => ({
        type: chain.type,
        technique: {
          slug: target?.slug,
          name: target?.name,
          category: target?.category,
          level: target?.level,
          gi: target?.gi,
        },
      }))
      .sort(
        (a, b) =>
          ['followup', 'counter', 'alternative'].indexOf(a.type) -
            ['followup', 'counter', 'alternative'].indexOf(b.type) ||
          a.technique.name?.localeCompare(b.technique.name ?? '', 'fr') ||
          0,
      ),
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "Certains champs sont invalides (nom, slug...). Corrige-les d'abord.",
    };
  }
  return { ok: true, technique: parsed.data };
}
