import { useQuery } from '@tanstack/react-query';
import { techniqueDetailSchema } from '@tatamap/shared';
import { ApiRequestError, fetchJson } from '../../lib/api';

/** `enabled: false` waits (the library fetches a technique only when its card starts playing). */
export function useTechnique(slug: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['technique', slug],
    enabled,
    queryFn: ({ signal }) =>
      fetchJson(`/api/techniques/${encodeURIComponent(slug)}`, techniqueDetailSchema, { signal }),
    // A 404 will not fix itself: do not retry it.
    retry: (failureCount, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && failureCount < 2,
  });
}
