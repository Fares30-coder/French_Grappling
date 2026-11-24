import { useQuery } from '@tanstack/react-query';
import { positionListSchema, techniqueListSchema } from '@tatamap/shared';
import { fetchJson } from '../../lib/api';
import { publicUrl } from '../../lib/public-data';

/** The whole published catalog (tens of techniques): the library filters it in the browser. */
export function useTechniqueList() {
  return useQuery({
    queryKey: ['techniques'],
    queryFn: ({ signal }) =>
      fetchJson(publicUrl({ kind: 'techniques' }), techniqueListSchema, { signal }),
  });
}

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: ({ signal }) =>
      fetchJson(publicUrl({ kind: 'positions' }), positionListSchema, { signal }),
  });
}
