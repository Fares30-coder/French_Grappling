import { useSyncExternalStore } from 'react';

/** Whether `query` matches now; re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's `xl` breakpoint: the ad rail shows from there, the inline ad below it. */
export const WIDE_SCREEN = '(min-width: 1280px)';
