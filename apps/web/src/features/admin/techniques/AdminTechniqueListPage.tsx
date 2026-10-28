import { CATEGORY_LABELS_FR } from '@tatamap/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminTechniques, useDeleteTechnique, useDuplicateTechnique } from '../api';
import { adminErrorMessage } from '../errors';
import { NewTechniqueDialog } from './NewTechniqueDialog';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function AdminTechniqueListPage() {
  const techniques = useAdminTechniques();
  const duplicate = useDuplicateTechnique();
  const remove = useDeleteTechnique();
  const [creating, setCreating] = useState(false);

  const actionError = duplicate.error ?? remove.error;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Techniques</h1>
        <button
          type="button"
          className="rounded bg-emerald-700 px-4 py-2 font-medium text-white"
          onClick={() => setCreating(true)}
        >
          Nouvelle technique
        </button>
      </div>

      {actionError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {adminErrorMessage(actionError)}
        </p>
      )}
      {techniques.isPending && <p className="mt-4 text-slate-600">Chargement…</p>}
      {techniques.isError && (
        <p role="alert" className="mt-4 text-red-700">
          {adminErrorMessage(techniques.error)}
        </p>
      )}

      {techniques.data && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-300 text-slate-600">
              <tr>
                <th className="py-2 pr-3">Nom</th>
                <th className="pr-3">Catégorie</th>
                <th className="pr-3">Départ</th>
                <th className="pr-3">Statut</th>
                <th className="pr-3">Étapes</th>
                <th className="pr-3">Modifié le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {techniques.data.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium">
                    <Link className="text-emerald-800 underline" to={`/admin/techniques/${t.id}`}>
                      {t.name}
                    </Link>
                  </td>
                  <td className="pr-3">{CATEGORY_LABELS_FR[t.category]}</td>
                  <td className="pr-3">{t.startPositionName}</td>
                  <td className="pr-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        t.status === 'published'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {t.status === 'published' ? 'Publié' : 'Brouillon'}
                    </span>
                  </td>
                  <td className="pr-3">{t.stepCount}</td>
                  <td className="pr-3">{dateFormat.format(new Date(t.updatedAt))}</td>
                  <td className="space-x-2 whitespace-nowrap py-2 text-right">
                    {t.status === 'published' && (
                      <Link className="underline" to={`/techniques/${t.slug}`}>
                        Voir
                      </Link>
                    )}
                    <button
                      type="button"
                      className="underline"
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(t.id)}
                    >
                      Dupliquer
                    </button>
                    {t.status === 'draft' && (
                      <button
                        type="button"
                        className="text-red-700 underline"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(`Supprimer « ${t.name} » ? Cette action est définitive.`)
                          ) {
                            remove.mutate(t.id);
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {techniques.data.length === 0 && (
            <p className="mt-3 text-slate-600">Aucune technique pour l'instant.</p>
          )}
        </div>
      )}

      {creating && <NewTechniqueDialog onClose={() => setCreating(false)} />}
    </main>
  );
}
