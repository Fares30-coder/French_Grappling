import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { buttonClass } from '../../ui/button';
import {
  canWorkOffline,
  downloadForOffline,
  type OfflineState,
  readOfflineState,
} from './offline-download';
import { useOnline } from './use-online';

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'error' };

/**
 * "Disponible hors ligne": saves every technique on this device for the club. Shown only once a
 * service worker controls the page (production build), since that is what keeps the files.
 */
export function OfflineCard() {
  const queryClient = useQueryClient();
  const online = useOnline();
  const [available, setAvailable] = useState(canWorkOffline);
  const [saved, setSaved] = useState<OfflineState | null>(readOfflineState);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const update = () => setAvailable(canWorkOffline());
    navigator.serviceWorker.addEventListener('controllerchange', update);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', update);
  }, []);

  if (!available) return null;

  const download = async () => {
    setStatus({ kind: 'running', done: 0, total: 0 });
    try {
      const state = await downloadForOffline(queryClient, (done, total) =>
        setStatus({ kind: 'running', done, total }),
      );
      setSaved(state);
      setStatus({ kind: 'idle' });
    } catch {
      setStatus({ kind: 'error' });
    }
  };

  const running = status.kind === 'running';
  const percent = running && status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <section
      aria-label="Disponible hors ligne"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface px-5 py-4"
    >
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 stroke-accent-bright"
      >
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
        <p className="m-0 font-bold">
          {saved ? 'Prêt pour le club, même sans réseau' : 'Disponible hors ligne'}
        </p>
        <p className="m-0 text-sm text-ink-muted" aria-live="polite">
          {running
            ? `Enregistrement… ${status.done} / ${status.total || '…'} techniques`
            : status.kind === 'error'
              ? "L'enregistrement a échoué. Vérifie ta connexion et réessaie."
              : saved
                ? `${saved.count} techniques enregistrées sur cet appareil le ${dateFr(saved.savedAt)}.`
                : 'Enregistre toutes les techniques sur cet appareil pour les consulter au club sans réseau.'}
        </p>
        {running && (
          <div
            role="progressbar"
            aria-label="Progression de l'enregistrement"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-line-strong"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <button
        type="button"
        className={buttonClass(saved ? 'secondary' : 'primary')}
        disabled={running || !online}
        onClick={download}
      >
        {saved ? 'Mettre à jour' : 'Enregistrer'}
      </button>
    </section>
  );
}
