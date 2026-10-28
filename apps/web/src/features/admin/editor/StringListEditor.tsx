import type { FieldErrors } from './validation';

type Props = {
  label: string;
  addLabel: string;
  items: ReadonlyArray<string>;
  onChange: (items: string[]) => void;
  /** Path prefix of the items in the field errors ("keyPoints"). */
  path: string;
  errors: FieldErrors;
  max?: number;
};

/** An editable list of short texts (key points, common mistakes). */
export function StringListEditor({
  label,
  addLabel,
  items,
  onChange,
  path,
  errors,
  max = 20,
}: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {items.map((item, i) => {
        const error = errors[`${path}.${i}`];
        return (
          // Items have no identity: the index is the key, and the list is short.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <input
                aria-label={`${label} ${i + 1}`}
                className="w-full rounded border border-slate-300 px-3 py-1.5"
                value={item}
                onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))}
              />
              {error && <span className="text-sm text-red-700">{error}</span>}
            </div>
            <button
              type="button"
              aria-label={`Retirer ${label.toLowerCase()} ${i + 1}`}
              className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        type="button"
        disabled={items.length >= max}
        className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
        onClick={() => onChange([...items, ''])}
      >
        {addLabel}
      </button>
    </fieldset>
  );
}
