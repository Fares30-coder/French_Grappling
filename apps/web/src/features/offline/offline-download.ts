import type { QueryClient } from '@tanstack/react-query';
import {
  graphSchema,
  positionListSchema,
  techniqueDetailSchema,
  techniqueListSchema,
} from '@tatamap/shared';
import { fetchJson } from '../../lib/api';

const STORAGE_KEY = 'tatamap:offline';

export type OfflineState = { savedAt: string; count: number };

/** What this device last saved for offline use (a per-device convenience: may be absent). */
export function readOfflineState(): OfflineState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === 'object' &&
      'savedAt' in value &&
      'count' in value &&
      typeof value.savedAt === 'string' &&
      typeof value.count === 'number'
    ) {
      return { savedAt: value.savedAt, count: value.count };
    }
  } catch {
    // Storage blocked (private mode...): behave as if nothing was saved.
  }
  return null;
}

function writeOfflineState(state: OfflineState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not fatal: the responses are in the service worker's cache anyway.
  }
}

/**
 * Fetches every public read once so the service worker caches them (its runtime cache keeps
 * public API responses), and fills the query cache on the way. The app code itself, 3D included,
 * is precached by the service worker.
 */
export async function downloadForOffline(
  queryClient: QueryClient,
  onProgress: (done: number, total: number) => void,
): Promise<OfflineState> {
  const list = await fetchJson('/api/techniques', techniqueListSchema);
  queryClient.setQueryData(['techniques'], list);
  queryClient.setQueryData(['positions'], await fetchJson('/api/positions', positionListSchema));
  queryClient.setQueryData(['graph'], await fetchJson('/api/graph', graphSchema));

  const total = list.techniques.length;
  onProgress(0, total);
  let done = 0;
  for (const { slug } of list.techniques) {
    const detail = await fetchJson(
      `/api/techniques/${encodeURIComponent(slug)}`,
      techniqueDetailSchema,
    );
    queryClient.setQueryData(['technique', slug], detail);
    done += 1;
    onProgress(done, total);
  }
  const state = { savedAt: new Date().toISOString(), count: total };
  writeOfflineState(state);
  return state;
}

/** True once a service worker controls the page (production build): offline can work. */
export const canWorkOffline = (): boolean =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  navigator.serviceWorker.controller !== null;
