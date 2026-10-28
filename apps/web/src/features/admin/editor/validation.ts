import { END_POSITION_MESSAGE, techniqueUpdateInputSchema } from '@tatamap/shared';
import type { z } from 'zod';

/** Field errors by dotted path ("name", "steps.1.title", "keyPoints.0"), in French. */
export type FieldErrors = Record<string, string>;

function describeIssue(issue: z.core.$ZodIssue): string {
  const field = String(issue.path[issue.path.length - 1] ?? '');
  switch (issue.code) {
    case 'too_small':
      if (field === 'slug') return 'Slug trop court (2 caractères minimum).';
      if (field === 'transitionMs') return 'Au moins 100 ms.';
      if (field === 'steps') return 'Il faut au moins une étape.';
      return 'Obligatoire.';
    case 'too_big':
      if (field === 'transitionMs') return 'Au plus 10 000 ms.';
      if (field === 'steps') return 'Maximum 40 étapes.';
      return `Trop long (${String(issue.maximum)} caractères maximum).`;
    case 'invalid_format':
      return field === 'slug'
        ? 'Slug invalide : lettres minuscules, chiffres et tirets.'
        : 'Format invalide.';
    case 'invalid_type':
      if (field === 'startPositionId') return 'Choisis une position de départ.';
      if (field === 'transitionMs') return 'Nombre entier attendu.';
      return 'Valeur invalide.';
    case 'custom':
      if (issue.message === END_POSITION_MESSAGE) {
        return "Choisis une position d'arrivée (une soumission n'en a pas).";
      }
      if (issue.message === 'duplicate tag') return 'Tag en double.';
      if (issue.message === 'duplicate chain') return 'Enchaînement en double.';
      return 'Valeur invalide.';
    default:
      return 'Valeur invalide.';
  }
}

/**
 * Checks the PUT body with the shared schema before sending it. Returns the first error of each
 * field (empty object = valid). The API checks again.
 */
export function validateUpdateInput(input: unknown): FieldErrors {
  const result = techniqueUpdateInputSchema.safeParse(input);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!(key in errors)) errors[key] = describeIssue(issue);
  }
  return errors;
}
