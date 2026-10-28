import type { Category, GiMode, Level } from '@tatamap/shared';
import {
  CATEGORIES,
  CATEGORY_LABELS_FR,
  GI_MODE_LABELS_FR,
  GI_MODES,
  LEVEL_LABELS_FR,
  LEVELS,
  slugify,
  techniqueCreateInputSchema,
} from '@tatamap/shared';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAdminPositions, useCreateTechnique } from '../api';
import { Dialog } from '../Dialog';
import { adminErrorMessage } from '../errors';
import { PositionSelect } from '../PositionSelect';

export function NewTechniqueDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const positions = useAdminPositions();
  const create = useCreateTechnique();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState<Category>('submission');
  const [level, setLevel] = useState<Level>('beginner');
  const [gi, setGi] = useState<GiMode>('both');
  const [startPositionId, setStartPositionId] = useState<string | null>(null);
  const [endPositionId, setEndPositionId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const isSubmission = category === 'submission';
  const shownSlug = slugTouched ? slug : slugify(name);
  const list = positions.data ?? [];
  const start = startPositionId ?? list[0]?.id ?? null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = techniqueCreateInputSchema.safeParse({
      slug: shownSlug,
      name,
      category,
      level,
      gi,
      startPositionId: start,
      endPositionId: isSubmission ? null : endPositionId,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(
        issue?.path[0] === 'slug'
          ? 'Le slug doit faire 2 caractères minimum (lettres, chiffres, tirets).'
          : issue?.path[0] === 'endPositionId'
            ? "Choisis la position d'arrivée (sauf pour une soumission)."
            : 'Renseigne le nom et la position de départ.',
      );
      return;
    }
    setFormError(null);
    create.mutate(parsed.data, {
      onSuccess: (technique) => navigate(`/admin/techniques/${technique.id}`),
    });
  };

  const input = 'mt-1 w-full rounded border border-slate-300 px-3 py-2';
  return (
    <Dialog title="Nouvelle technique" onClose={onClose}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium">Nom</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Slug (adresse de la page)</span>
          <input
            className={input}
            value={shownSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Catégorie</span>
            <select
              className={input}
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)} // options come from CATEGORIES
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS_FR[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Niveau</span>
            <select
              className={input}
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)} // options come from LEVELS
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS_FR[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Gi / no-gi</span>
            <select
              className={input}
              value={gi}
              onChange={(e) => setGi(e.target.value as GiMode)} // options come from GI_MODES
            >
              {GI_MODES.map((g) => (
                <option key={g} value={g}>
                  {GI_MODE_LABELS_FR[g]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PositionSelect
          label="Position de départ"
          value={start}
          positions={list}
          onChange={setStartPositionId}
        />
        <PositionSelect
          label="Position d'arrivée"
          value={isSubmission ? null : endPositionId}
          positions={list}
          disabled={isSubmission}
          allowNone
          onChange={setEndPositionId}
        />
        {isSubmission && (
          <p className="text-sm text-slate-600">Une soumission n'a pas de position d'arrivée.</p>
        )}
        {(formError || create.isError) && (
          <p role="alert" className="text-sm text-red-700">
            {formError ?? adminErrorMessage(create.error)}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-4 py-2"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            Créer
          </button>
        </div>
      </form>
    </Dialog>
  );
}
