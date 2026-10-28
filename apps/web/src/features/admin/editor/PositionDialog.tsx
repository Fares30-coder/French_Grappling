import {
  type AdminPosition,
  POSITION_ROLE_LABELS_FR,
  POSITION_ROLES,
  type PositionRole,
  positionInputSchema,
  slugify,
} from '@tatamap/shared';
import { type FormEvent, useState } from 'react';
import { useSavePosition } from '../api';
import { Dialog } from '../Dialog';
import { adminErrorMessage } from '../errors';

type Props = {
  /** Absent = creation. */
  position?: AdminPosition;
  onClose: () => void;
  onSaved: (position: AdminPosition) => void;
};

const field = 'mt-1 w-full rounded border border-slate-300 px-3 py-2';

export function PositionDialog({ position, onClose, onSaved }: Props) {
  const save = useSavePosition();
  const [name, setName] = useState(position?.name ?? '');
  const [slug, setSlug] = useState(position?.slug ?? '');
  // The slug follows the name until it is edited by hand (always touched when editing).
  const [slugTouched, setSlugTouched] = useState(position !== undefined);
  const [role, setRole] = useState<PositionRole>(position?.role ?? 'bottom');
  const [description, setDescription] = useState(position?.description ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const shownSlug = slugTouched ? slug : slugify(name);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = positionInputSchema.safeParse({ slug: shownSlug, name, description, role });
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.path[0];
      setFormError(
        first === 'slug'
          ? 'Le slug doit faire 2 caractères minimum (lettres minuscules, chiffres, tirets).'
          : first === 'description'
            ? 'Description trop longue (1000 caractères maximum).'
            : 'Renseigne le nom de la position.',
      );
      return;
    }
    setFormError(null);
    save.mutate(
      { ...(position ? { id: position.id } : {}), input: parsed.data },
      {
        onSuccess: (saved) => {
          onSaved(saved);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog title={position ? 'Modifier la position' : 'Nouvelle position'} onClose={onClose}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium">Nom</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Slug</span>
          <input
            className={field}
            value={shownSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Rôle (vu depuis toi)</span>
          <select
            className={field}
            value={role}
            onChange={(e) => setRole(e.target.value as PositionRole)} // options come from POSITION_ROLES
          >
            {POSITION_ROLES.map((r) => (
              <option key={r} value={r}>
                {POSITION_ROLE_LABELS_FR[r]}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-600">
            « Dessous » : tu es en dessous. La même situation vue de l'autre côté est une autre
            position (ex. « Garde fermée » et « Dans la garde fermée »).
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <textarea
            rows={3}
            className={field}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {(formError || save.isError) && (
          <p role="alert" className="text-sm text-red-700">
            {formError ?? adminErrorMessage(save.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-4 py-2"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </Dialog>
  );
}
