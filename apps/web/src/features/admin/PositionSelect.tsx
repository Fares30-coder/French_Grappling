import type { AdminPosition } from '@tatamap/shared';

type Props = {
  label: string;
  value: string | null;
  positions: ReadonlyArray<AdminPosition>;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  /** Offers an empty choice (end position of a submission). */
  allowNone?: boolean;
  error?: string | undefined;
  /** Opens the creation dialog. */
  onCreate?: () => void;
  /** Opens the edit dialog for the selected position. */
  onEdit?: () => void;
};

export function PositionSelect({
  label,
  value,
  positions,
  onChange,
  disabled = false,
  allowNone = false,
  error,
  onCreate,
  onEdit,
}: Props) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        {(allowNone || value === null) && <option value="">—</option>}
        {positions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {error && <span className="text-sm text-red-700">{error}</span>}
      {(onCreate || onEdit) && (
        <span className="mt-1 flex gap-3 text-sm">
          {onCreate && (
            <button type="button" className="underline" disabled={disabled} onClick={onCreate}>
              + Nouvelle position
            </button>
          )}
          {onEdit && value !== null && (
            <button type="button" className="underline" onClick={onEdit}>
              Modifier
            </button>
          )}
        </span>
      )}
    </label>
  );
}
