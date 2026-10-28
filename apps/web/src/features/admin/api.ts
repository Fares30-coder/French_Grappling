import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AdminSession,
  adminPositionListSchema,
  adminSessionSchema,
  adminTechniqueListSchema,
  adminTechniqueSchema,
  type LoginInput,
  type TechniqueCreateInput,
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
