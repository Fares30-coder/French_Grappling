import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AdminPosition,
  type AdminSession,
  adminPositionListSchema,
  adminPositionSchema,
  adminSessionSchema,
  adminTagListSchema,
  adminTagSchema,
  adminTechniqueListSchema,
  adminTechniqueSchema,
  type LoginInput,
  type PositionInput,
  type TagInput,
  type TechniqueCreateInput,
  type TechniqueUpdateInput,
} from '@tatamap/shared';
import { ApiRequestError, apiRequest, apiSend } from '../../lib/api';

/**
 * Admin data is never kept beyond what is on screen (gcTime 0) and is cleared at logout: the
 * browser must not keep drafts around after "Se déconnecter".
 */
export const adminQueryDefaults = { staleTime: 0, gcTime: 0, refetchOnWindowFocus: false } as const;

const SESSION_KEY = ['admin', 'session'] as const;

/** Current admin (GET /api/admin/me). A 401 means "not logged in" and is not retried. */
export function useAdminSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: ({ signal }) => apiRequest('/api/admin/me', adminSessionSchema, { signal }),
    retry: false,
    ...adminQueryDefaults,
  });
}

export const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiRequestError && error.status === 401;

/** French message for a login failure. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'Identifiants invalides';
    if (error.status === 429) return 'Trop de tentatives, réessaie dans quelques minutes.';
    if (error.code === 'network') return 'Impossible de joindre le serveur.';
  }
  return 'Une erreur est survenue. Réessaie plus tard.';
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest('/api/auth/login', adminSessionSchema, { method: 'POST', body: input }),
    onSuccess: (session: AdminSession) => {
      queryClient.setQueryData(SESSION_KEY, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    // No body on purpose: the API refuses one.
    mutationFn: () => apiSend('/api/auth/logout', { method: 'POST' }),
    // Whatever the outcome, forget everything held in memory.
    onSettled: () => {
      queryClient.clear();
    },
  });
}

const TECHNIQUES_KEY = ['admin', 'techniques'] as const;
const POSITIONS_KEY = ['admin', 'positions'] as const;

export function useAdminTechniques() {
  return useQuery({
    queryKey: TECHNIQUES_KEY,
    queryFn: ({ signal }) =>
      apiRequest('/api/admin/techniques', adminTechniqueListSchema, { signal }),
    ...adminQueryDefaults,
  });
}

export function useAdminPositions() {
  return useQuery({
    queryKey: POSITIONS_KEY,
    queryFn: ({ signal }) =>
      apiRequest('/api/admin/positions', adminPositionListSchema, { signal }),
    ...adminQueryDefaults,
  });
}

export function useCreateTechnique() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TechniqueCreateInput) =>
      apiRequest('/api/admin/techniques', adminTechniqueSchema, { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TECHNIQUES_KEY }),
  });
}

export function useDuplicateTechnique() {
  const queryClient = useQueryClient();
  return useMutation({
    // No body on purpose: the API refuses one.
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/techniques/${id}/duplicate`, adminTechniqueSchema, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TECHNIQUES_KEY }),
  });
}

export function useDeleteTechnique() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/api/admin/techniques/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TECHNIQUES_KEY }),
  });
}

const techniqueKey = (id: string) => ['admin', 'technique', id] as const;

export function useAdminTechnique(id: string) {
  return useQuery({
    queryKey: techniqueKey(id),
    queryFn: ({ signal }) =>
      apiRequest(`/api/admin/techniques/${id}`, adminTechniqueSchema, { signal }),
    // A 404 or 401 will not fix itself.
    retry: false,
    ...adminQueryDefaults,
  });
}

export function useSaveTechnique(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TechniqueUpdateInput) =>
      apiRequest(`/api/admin/techniques/${id}`, adminTechniqueSchema, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (technique) => {
      queryClient.setQueryData(techniqueKey(id), technique);
      // The public page must not serve the previous content from its cache.
      void queryClient.invalidateQueries({ queryKey: ['technique'] });
      return queryClient.invalidateQueries({ queryKey: TECHNIQUES_KEY });
    },
  });
}

/** Publish or unpublish, guarded by the version the editor last saw. */
export function useSetTechniqueStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, version }: { action: 'publish' | 'unpublish'; version: number }) =>
      apiRequest(`/api/admin/techniques/${id}/${action}`, adminTechniqueSchema, {
        method: 'POST',
        body: { version },
      }),
    onSuccess: (technique) => {
      queryClient.setQueryData(techniqueKey(id), technique);
      void queryClient.invalidateQueries({ queryKey: ['technique'] }); // public page cache
      return queryClient.invalidateQueries({ queryKey: TECHNIQUES_KEY });
    },
  });
}

const TAGS_KEY = ['admin', 'tags'] as const;

export function useAdminTags() {
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: ({ signal }) => apiRequest('/api/admin/tags', adminTagListSchema, { signal }),
    ...adminQueryDefaults,
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TagInput) =>
      apiRequest('/api/admin/tags', adminTagSchema, { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TAGS_KEY }),
  });
}

/** Creates a position (no `id`) or renames/edits one (`id`). */
export function useSavePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PositionInput }) =>
      apiRequest(id ? `/api/admin/positions/${id}` : '/api/admin/positions', adminPositionSchema, {
        method: id ? 'PUT' : 'POST',
        body: input,
      }),
    // The select needs the new position right away, before the refetch finishes.
    onSuccess: async (position) => {
      queryClient.setQueryData(POSITIONS_KEY, (old: AdminPosition[] | undefined) =>
        old ? [...old.filter((p) => p.id !== position.id), position] : [position],
      );
      await queryClient.invalidateQueries({ queryKey: POSITIONS_KEY });
      await queryClient.invalidateQueries({ queryKey: TECHNIQUES_KEY }); // start position names
    },
  });
}
