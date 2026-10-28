import { useQuery } from '@tanstack/react-query';
import { techniqueDetailSchema } from '@tatamap/shared';
import { ApiRequestError, fetchJson } from '../../lib/api';

export function useTechnique(slug: string) {
  return useQuery({
    queryKey: ['technique', slug],
    queryFn: ({ signal }) =>
      fetchJson(`/api/techniques/${encodeURIComponent(slug)}`, techniqueDetailSchema, { signal }),
    // A 404 will not fix itself: do not retry it.
    retry: (failureCount, error) =>
      !(error instanceof ApiRequestError && error.status === 404) && failureCount < 2,
  });
}
