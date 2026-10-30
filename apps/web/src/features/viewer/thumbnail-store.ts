import type { CurrentPose } from '@tatamap/shared';
import { useSyncExternalStore } from 'react';

// Static thumbnails (ADR 0003 D4, fallback): each card shows a still image of its step-1 pose,
// rendered once per session by a single off-screen canvas. No three.js here: cards ask for
// their image before the lazy 3D chunk has loaded.

type Entry = { pose: CurrentPose; url?: string };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let firstPending: { key: string; pose: CurrentPose } | undefined;

function emit(): void {
  const pending = [...entries].find(([, e]) => e.url === undefined);
  firstPending = pending ? { key: pending[0], pose: pending[1].pose } : undefined;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Queues the still image of `key` (a technique slug); no-op if already queued or done. */
export function requestSnapshot(key: string, pose: CurrentPose): void {
  if (entries.has(key)) return;
  entries.set(key, { pose });
  emit();
}

export function setSnapshot(key: string, url: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  entry.url = url;
  emit();
}

/** The data URL of `key`'s still image, once rendered. */
export const useSnapshot = (key: string): string | undefined =>
  useSyncExternalStore(subscribe, () => entries.get(key)?.url);

/** The next image to render, for the snapshot renderer. Stable between changes. */
export const usePendingSnapshot = (): { key: string; pose: CurrentPose } | undefined =>
  useSyncExternalStore(subscribe, () => firstPending);
