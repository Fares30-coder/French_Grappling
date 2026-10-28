import type { AdminTechnique } from '@tatamap/shared';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../../../lib/api';
import { TechniqueViewer } from '../../viewer/TechniqueViewer';
import { isUnauthorized, useAdminPositions, useAdminTechnique, useSaveTechnique } from '../api';
import { adminErrorMessage } from '../errors';
import { editorReducer, initialEditorState, isDirty, toUpdateInput } from './editor-state';
import { MetaForm } from './MetaForm';
import { StepsPanel } from './StepsPanel';
import { useUnsavedGuard } from './use-unsaved-guard';
import { validateUpdateInput } from './validation';

/** Loads the technique, then hands it to the editor (which owns the editing state). */
export function TechniqueEditorPage() {
  const { id = '' } = useParams();
  const query = useAdminTechnique(id);
  // Bumped by "Recharger": remounts the editor on the freshly loaded technique.
  const [reloadKey, setReloadKey] = useState(0);

  if (query.isPending) return <p className="p-6 text-slate-600">Chargement…</p>;
  if (query.error) {
    const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
    query.error instanceof Error && 'status' in query.error && query.error.status === 404;
    return (
      <div className="p-6">
        <p role="alert" className="text-slate-800">
          {notFound ? 'Technique introuvable.' : adminErrorMessage(query.error)}
        </p>
        <Link className="mt-3 inline-block underline" to="/admin/techniques">
          Retour à la liste
        </Link>
      </div>
    );
  }
  return (
    <TechniqueEditor
      key={`${id}:${reloadKey}`}
      loaded={query.data}
      reload={async () => {
        await query.refetch();
        setReloadKey((k) => k + 1);
      }}
    />
  );
}

function TechniqueEditor({
  loaded,
  reload,
}: {
  loaded: AdminTechnique;
  reload: () => Promise<void>;
}) {
  const [state, dispatch] = useReducer(editorReducer, loaded, initialEditorState);
  const positions = useAdminPositions();
  const save = useSaveTechnique(loaded.id);
  const [showErrors, setShowErrors] = useState(false);
  const dirty = isDirty(state);
  useUnsavedGuard(dirty);

  const input = useMemo(() => toUpdateInput(state), [state]);
  const errors = useMemo(() => (showErrors ? validateUpdateInput(input) : {}), [showErrors, input]);

  const onSave = useCallback(() => {
    if (save.isPending) return;
    const found = validateUpdateInput(input);
    setShowErrors(true);
    if (Object.keys(found).length > 0) return;
    const sentRevision = state.revision;
    save.mutate(input, {
      onSuccess: (technique) =>
        dispatch({ type: 'saved', version: technique.version, revision: sentRevision }),
    });
  }, [input, save, state.revision]);

  // Cmd/Ctrl+S saves instead of the browser's "save page".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSave]);

  const conflict = save.error && 'reason' in save.error && save.error.reason === 'version_mismatch';
  const published = loaded.status === 'published';
  const errorCount = Object.keys(errors).length;

  return (
    <main className="mx-auto max-w-6xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link className="text-sm underline" to="/admin/techniques">
          ← Techniques
        </Link>
        <h1 className="text-xl font-bold">{state.technique.name || '(sans nom)'}</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            published ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800'
          }`}
        >
          {published ? 'Publié' : 'Brouillon'}
        </span>
        {dirty && <span className="text-sm text-amber-700">Modifications non enregistrées</span>}
        <button
          type="button"
          disabled={save.isPending || !dirty}
          className="ml-auto rounded bg-emerald-700 px-4 py-1.5 font-medium text-white disabled:opacity-50"
          onClick={onSave}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {save.isError && (
        <div
          role="alert"
          className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <p>
            {isUnauthorized(save.error)
              ? 'Session expirée : reconnecte-toi dans un autre onglet puis réessaie.'
              : adminErrorMessage(save.error)}
          </p>
          {conflict && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded border border-red-400 px-3 py-1"
                onClick={() => {
                  if (window.confirm('Recharger perd tes modifications locales. Continuer ?')) {
                    void reload();
                  }
                }}
              >
                Recharger
              </button>
              <button
                type="button"
                className="rounded border border-red-400 px-3 py-1"
                onClick={() => void navigator.clipboard.writeText(JSON.stringify(input, null, 2))}
              >
                Copier mes modifications (JSON)
              </button>
            </div>
          )}
        </div>
      )}
      {errorCount > 0 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {errorCount} champ{errorCount > 1 ? 's' : ''} à corriger (en rouge ci-dessous).
        </p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <TechniqueViewer
            className="aspect-video w-full overflow-hidden rounded-lg"
            steps={state.technique.steps}
            stepIndex={state.stepIndex}
            playing={false}
          />
          <div className="mt-6">
            <StepsPanel
              steps={state.technique.steps}
              stepIndex={state.stepIndex}
              errors={errors}
              dispatch={dispatch}
            />
          </div>
        </div>
        <MetaForm
          technique={state.technique}
          positions={positions.data ?? []}
          published={published}
          errors={errors}
          onChange={(patch) => dispatch({ type: 'setMeta', patch })}
        />
      </div>
    </main>
  );
}
