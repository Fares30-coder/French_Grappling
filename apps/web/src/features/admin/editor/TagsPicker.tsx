import { slugify } from '@tatamap/shared';
import { useState } from 'react';
import { useAdminTags, useCreateTag } from '../api';
import { adminErrorMessage } from '../errors';

type Props = {
  selected: ReadonlyArray<string>;
  onChange: (tagIds: string[]) => void;
  error?: string | undefined;
};

/** Tags as checkboxes, plus a quick "new tag" field. */
export function TagsPicker({ selected, onChange, error }: Props) {
  const tags = useAdminTags();
  const create = useCreateTag();
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...selected, id] : selected.filter((t) => t !== id));

  const onCreate = () => {
    const slug = slugify(name);
    if (name.trim() === '' || slug.length < 2) {
      setLocalError('Donne un nom au tag (2 caractères minimum).');
      return;
    }
    setLocalError(null);
    create.mutate(
      { slug, name: name.trim() },
      {
        onSuccess: (tag) => {
          setName('');
          onChange([...selected, tag.id]);
        },
      },
    );
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Tags</legend>
      {tags.isPending && <p className="text-sm text-slate-600">Chargement…</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {tags.data?.map((tag) => (
          <label key={tag.id} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(tag.id)}
              onChange={(e) => toggle(tag.id, e.target.checked)}
            />
            {tag.name}
          </label>
        ))}
        {tags.data?.length === 0 && (
          <p className="text-sm text-slate-600">Aucun tag pour l'instant.</p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          aria-label="Nom du nouveau tag"
          placeholder="Nouveau tag"
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // do not submit anything else
              onCreate();
            }
          }}
        />
        <button
          type="button"
          disabled={create.isPending}
          className="rounded border border-slate-300 px-3 py-1 text-sm"
          onClick={onCreate}
        >
          + Nouveau tag
        </button>
      </div>
      {(localError || create.isError) && (
        <p role="alert" className="text-sm text-red-700">
          {localError ?? adminErrorMessage(create.error)}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
