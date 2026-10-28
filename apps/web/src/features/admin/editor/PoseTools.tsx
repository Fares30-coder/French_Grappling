import type { StandardBodyWarning } from '@tatamap/shared';
import { formatWarning } from './labels';

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  ghost: boolean;
  onGhost: (value: boolean) => void;
  hasPrevious: boolean;
  onCopyPrevious: () => void;
  onMirror: (scope: 'step' | 'all') => void;
  playing: boolean;
  onTogglePlay: () => void;
  warnings: ReadonlyArray<StandardBodyWarning>;
};

const button = 'rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50';

/** Editing aids: undo/redo, onion skin, copy, mirror, playback of the unsaved steps, bone warnings. */
export function PoseTools({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  ghost,
  onGhost,
  hasPrevious,
  onCopyPrevious,
  onMirror,
  playing,
  onTogglePlay,
  warnings,
}: Props) {
  return (
    <section aria-label="Aides à la saisie" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={onTogglePlay}>
          {playing ? 'Pause' : 'Lecture'}
        </button>
        <button type="button" className={button} disabled={!canUndo} onClick={onUndo}>
          Annuler
        </button>
        <button type="button" className={button} disabled={!canRedo} onClick={onRedo}>
          Rétablir
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ghost} onChange={(e) => onGhost(e.target.checked)} />
        Afficher l'étape précédente
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!hasPrevious} onClick={onCopyPrevious}>
          Copier la pose de l'étape précédente
        </button>
        <button type="button" className={button} onClick={() => onMirror('step')}>
          Miroir (cette étape)
        </button>
        <button type="button" className={button} onClick={() => onMirror('all')}>
          Miroir (toutes les étapes)
        </button>
      </div>
      {warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Longueurs d'os inhabituelles (par rapport à l'étape 1)</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={`${w.fighter}-${w.bone}`}>{formatWarning(w)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
