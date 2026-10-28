import {
  CHAIN_TYPE_LABELS_FR,
  CHAIN_TYPES,
  type ChainInput,
  type ChainType,
} from '@tatamap/shared';
import { useAdminTechniques } from '../api';

type Props = {
  /** The technique being edited: it cannot chain to itself. */
  currentId: string;
  chains: ReadonlyArray<ChainInput>;
  onChange: (chains: ChainInput[]) => void;
  error?: string | undefined;
};

/** "After this technique": type + target, drafts included (marked). */
export function ChainsEditor({ currentId, chains, onChange, error }: Props) {
  const techniques = useAdminTechniques();
  const targets = (techniques.data ?? []).filter((t) => t.id !== currentId);

  const update = (index: number, patch: Partial<ChainInput>) =>
    onChange(chains.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const first = targets[0];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Enchaînements</legend>
      {chains.map((chain, i) => {
        const known = targets.some((t) => t.id === chain.toId);
        return (
          // A chain has no identity apart from its row.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <div key={i} className="flex items-center gap-2">
            <select
              aria-label={`Type de l'enchaînement ${i + 1}`}
              className="rounded border border-slate-300 px-2 py-1.5"
              value={chain.type}
              onChange={(e) => update(i, { type: e.target.value as ChainType })} // options come from CHAIN_TYPES
            >
              {CHAIN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CHAIN_TYPE_LABELS_FR[type]}
                </option>
              ))}
            </select>
            <select
              aria-label={`Technique cible de l'enchaînement ${i + 1}`}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5"
              value={chain.toId}
              onChange={(e) => update(i, { toId: e.target.value })}
            >
              {!known && <option value={chain.toId}>(technique introuvable)</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.status === 'draft' ? ' (brouillon)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Retirer l'enchaînement ${i + 1}`}
              className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
              onClick={() => onChange(chains.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        type="button"
        disabled={!first || chains.length >= 30}
        className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
        onClick={() => first && onChange([...chains, { toId: first.id, type: 'followup' }])}
      >
        Ajouter un enchaînement
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
