import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

// No three.js here: the provider wraps the page before the lazy 3D chunk has loaded.

type PlayingState = { count: number; register: (delta: 1 | -1) => void };

const PlayingContext = createContext<PlayingState>({ count: 0, register: () => {} });

/** Counts the thumbnails that are playing, so the shared canvas animates only while one is. */
export function ThumbnailPlayingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const register = useCallback((delta: 1 | -1) => setCount((n) => n + delta), []);
  return <PlayingContext.Provider value={{ count, register }}>{children}</PlayingContext.Provider>;
}

/** Declares that a thumbnail is playing, for as long as `playing` is true. */
export function useRegisterPlaying(playing: boolean): void {
  const { register } = useContext(PlayingContext);
  useEffect(() => {
    if (!playing) return;
    register(1);
    return () => register(-1);
  }, [playing, register]);
}

export const useAnyThumbnailPlaying = (): boolean => useContext(PlayingContext).count > 0;
