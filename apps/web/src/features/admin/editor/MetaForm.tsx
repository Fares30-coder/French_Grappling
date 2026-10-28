import {
  type AdminPosition,
  CATEGORIES,
  CATEGORY_LABELS_FR,
  type Category,
  GI_MODE_LABELS_FR,
  GI_MODES,
  type GiMode,
  LEVEL_LABELS_FR,
  LEVELS,
  type Level,
} from '@tatamap/shared';
import { PositionSelect } from '../PositionSelect';
import type { EditorTechnique, MetaPatch } from './editor-state';
import { StringListEditor } from './StringListEditor';
import type { FieldErrors } from './validation';

type Props = {
  technique: EditorTechnique;
  positions: ReadonlyArray<AdminPosition>;
  published: boolean;
  errors: FieldErrors;
  onChange: (patch: MetaPatch) => void;
};

const field = 'mt-1 w-full rounded border border-slate-300 px-3 py-2';

export function MetaForm({ technique, positions, published, errors, onChange }: Props) {
  const isSubmission = technique.category === 'submission';
  return (
    <section className="space-y-3" aria-label="Informations">
      <label className="block">
        <span className="text-sm font-medium">Nom</span>
        <input
          className={field}
          value={technique.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {errors.name && <span className="text-sm text-red-700">{errors.name}</span>}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Slug (adresse de la page)</span>
        <input
          className={`${field} disabled:bg-slate-100`}
          value={technique.slug}
          disabled={published}
          onChange={(e) => onChange({ slug: e.target.value })}
        />
        {published && (
          <span className="text-sm text-slate-600">
            Figé tant que la technique est publiée : c'est son adresse publique. Dépublie-la pour le
            changer.
          </span>
        )}
        {errors.slug && <span className="block text-sm text-red-700">{errors.slug}</span>}
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-sm font-medium">Catégorie</span>
          <select
            className={field}
            value={technique.category}
            onChange={(e) => onChange({ category: e.target.value as Category })} // options come from CATEGORIES
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
            className={field}
            value={technique.level}
            onChange={(e) => onChange({ level: e.target.value as Level })} // options come from LEVELS
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
            className={field}
            value={technique.gi}
            onChange={(e) => onChange({ gi: e.target.value as GiMode })} // options come from GI_MODES
          >
            {GI_MODES.map((g) => (
              <option key={g} value={g}>
                {GI_MODE_LABELS_FR[g]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PositionSelect
          label="Position de départ"
          value={technique.startPositionId}
          positions={positions}
          error={errors.startPositionId}
          onChange={(id) => id && onChange({ startPositionId: id })}
        />
        <PositionSelect
          label="Position d'arrivée"
          value={isSubmission ? null : technique.endPositionId}
          positions={positions}
          disabled={isSubmission}
          allowNone
          error={errors.endPositionId}
          onChange={(id) => onChange({ endPositionId: id })}
        />
      </div>
      {isSubmission && (
        <p className="text-sm text-slate-600">Une soumission n'a pas de position d'arrivée.</p>
      )}

      <StringListEditor
        label="Points clés"
        addLabel="Ajouter un point clé"
        items={technique.keyPoints}
        path="keyPoints"
        errors={errors}
        onChange={(keyPoints) => onChange({ keyPoints })}
      />
      <StringListEditor
        label="Erreurs fréquentes"
        addLabel="Ajouter une erreur"
        items={technique.commonMistakes}
        path="commonMistakes"
        errors={errors}
        onChange={(commonMistakes) => onChange({ commonMistakes })}
      />
    </section>
  );
}
