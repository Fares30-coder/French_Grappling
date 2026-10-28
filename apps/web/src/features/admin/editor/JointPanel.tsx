import { FIGHTERS, type FighterId, JOINTS_V1_11, type Vec3 } from '@tatamap/shared';
import type { JointRef } from './editor-state';
import { FIGHTER_LABELS_FR, JOINT_LABELS_FR } from './labels';

type Props = {
  selected: JointRef | null;
  /** Position of the selected joint in the current step. */
  position: Vec3 | null;
  onSelect: (joint: JointRef) => void;
  onMove: (position: Vec3) => void;
};

const AXES = ['x', 'y', 'z'] as const;
const FIGHTER_COLOR: Record<FighterId, string> = {
  me: 'border-emerald-700',
  opponent: 'border-orange-600',
};

/** Joint buttons (when spheres overlap in the 3D view) and the numeric x / y / z of the selection. */
export function JointPanel({ selected, position, onSelect, onMove }: Props) {
  const setAxis = (axis: number, value: number) => {
    if (!position || !Number.isFinite(value)) return;
    const next: Vec3 = [position[0], position[1], position[2]];
    next[axis] = value;
    onMove(next);
  };
  return (
    <section aria-label="Articulations" className="space-y-3">
      <h2 className="text-lg font-semibold">Articulations</h2>
      {FIGHTERS.map((fighter) => (
        <fieldset key={fighter} className="space-y-1">
          <legend className="text-sm font-medium">{FIGHTER_LABELS_FR[fighter]}</legend>
          <div className="flex flex-wrap gap-1">
            {JOINTS_V1_11.map((joint) => {
              const isSelected = selected?.fighter === fighter && selected.joint === joint;
              return (
                <button
                  key={joint}
                  type="button"
                  aria-pressed={isSelected}
                  className={`rounded border px-2 py-1 text-xs ${FIGHTER_COLOR[fighter]} ${
                    isSelected ? 'bg-slate-800 text-white' : 'bg-white'
                  }`}
                  onClick={() => onSelect({ fighter, joint })}
                >
                  {JOINT_LABELS_FR[joint]}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {selected && position ? (
        <div>
          <p className="text-sm">
            {JOINT_LABELS_FR[selected.joint]} · {FIGHTER_LABELS_FR[selected.fighter]} (cm)
          </p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {AXES.map((axis, i) => (
              <label key={axis} className="block text-sm">
                <span className="font-medium uppercase">{axis}</span>
                <input
                  type="number"
                  step={1}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  value={Math.round((position[i] ?? 0) * 10) / 10}
                  onChange={(e) => setAxis(i, e.target.valueAsNumber)}
                  onKeyDown={(e) => {
                    // Arrows move by 1 cm, Shift + arrows by 10 cm.
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    const delta = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
                    setAxis(i, (position[i] ?? 0) + delta);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Flèches : ±1 cm, Maj + flèches : ±10 cm. Échap : désélectionner.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Clique une sphère dans la vue 3D, ou un bouton ci-dessus, pour déplacer une articulation.
        </p>
      )}
    </section>
  );
}
