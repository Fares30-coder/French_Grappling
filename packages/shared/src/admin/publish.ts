import type { TechniqueUpdateInput } from './technique';

/** Why a technique cannot be published yet (French, shown as-is in the editor). Empty = publishable. */
export function publishIssues(t: Pick<TechniqueUpdateInput, 'steps' | 'keyPoints'>): string[] {
  const issues: string[] = [];
  if (t.steps.length < 2) issues.push('Il faut au moins 2 étapes.');
  if (t.keyPoints.length < 1) issues.push('Ajoute au moins un point clé.');
  return issues;
}
