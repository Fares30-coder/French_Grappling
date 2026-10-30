import { useQuery } from '@tanstack/react-query';
import { positionListSchema, techniqueListSchema } from '@tatamap/shared';
import { fetchJson } from '../../lib/api';

/** The whole published catalog (tens of techniques): the library filters it in the browser. */
export function useTechniqueList() {
  return useQuery({
    queryKey: ['techniques'],
    queryFn: ({ signal }) => fetchJson('/api/techniques', techniqueListSchema, { signal }),
  });
}

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: ({ signal }) => fetchJson('/api/positions', positionListSchema, { signal }),
  });
}
