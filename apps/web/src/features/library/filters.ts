import { type TechniqueListQuery, techniqueListQuerySchema } from '@tatamap/shared';

export type FilterKey = Exclude<keyof TechniqueListQuery, 'q'>;

/**
 * Reads the library filters from the URL (same names as the API). Each parameter is validated on
 * its own: a stale or hand-edited value drops that filter only, never the whole page.
 */
export function readFilters(params: URLSearchParams): TechniqueListQuery {
  const query: TechniqueListQuery = {};
  for (const key of ['categorie', 'position', 'niveau', 'gi', 'q'] as const) {
    const value = params.get(key);
    if (value === null || value === '') continue;
    const parsed = techniqueListQuerySchema.shape[key].safeParse(value);
    if (parsed.success && parsed.data !== undefined && parsed.data !== '') {
      Object.assign(query, { [key]: parsed.data });
    }
  }
  return query;
}

/** Returns new params with `key` set, or removed when `value` is undefined or empty. */
export function withFilter(
  params: URLSearchParams,
  key: FilterKey | 'q',
  value: string | undefined,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}

export const hasFilters = (query: TechniqueListQuery): boolean =>
  Object.values(query).some((v) => v !== undefined && v !== '');
