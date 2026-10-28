import { useEffect } from 'react';
import { useBlocker } from 'react-router';

export const UNSAVED_MESSAGE = 'Modifications non enregistrées. Quitter quand même ?';

/** Warns before leaving the page (close, reload, link, back button) while `dirty`. */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault(); // the browser shows its own generic text
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(UNSAVED_MESSAGE)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}
