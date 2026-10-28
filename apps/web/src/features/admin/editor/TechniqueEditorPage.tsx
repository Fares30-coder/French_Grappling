import type { AdminTechnique, CameraHint, Vec3 } from '@tatamap/shared';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../../../lib/api';
import type { ViewPreset } from '../../viewer/camera';
import { TechniqueViewer } from '../../viewer/TechniqueViewer';
import { isUnauthorized, useAdminPositions, useAdminTechnique, useSaveTechnique } from '../api';
import { adminErrorMessage } from '../errors';
import { CameraCapture } from './CameraCapture';
import {
  currentWarnings,
  type EditorAction,
  editorReducer,
  initialEditorState,
  isDirty,
  toUpdateInput,
} from './editor-state';
import { JointGizmo } from './JointGizmo';
import { JointPanel } from './JointPanel';
import { MetaForm } from './MetaForm';
import { PoseTools } from './PoseTools';
import { StepsPanel } from './StepsPanel';
import { useUnsavedGuard } from './use-unsaved-guard';
import { validateUpdateInput } from './validation';

const VIEWS: ReadonlyArray<readonly [ViewPreset, string]> = [
  ['step', '3D'],
  ['front', 'Face'],
  ['side', 'Profil'],
  ['top', 'Dessus'],
];

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
  const [state, rawDispatch] = useReducer(editorReducer, loaded, initialEditorState);
  const [playing, setPlaying] = useState(false);
  const [ghost, setGhost] = useState(true);
  // Any user action stops playback; the steps reached by playback itself use rawDispatch.
  const dispatch = useCallback((action: EditorAction) => {
    setPlaying(false);
    rawDispatch(action);
  }, []);
  const positions = useAdminPositions();
  const save = useSaveTechnique(loaded.id);
  const [showErrors, setShowErrors] = useState(false);
  const dirty = isDirty(state);
  useUnsavedGuard(dirty);

  // 3D view: preset + a counter that re-applies the framing (also for "Recentrer").
  const [view, setView] = useState<ViewPreset>('step');
  const [cameraKey, setCameraKey] = useState(0);
  const captureRef = useRef<(() => CameraHint | null) | null>(null);
  const showView = (next: ViewPreset) => {
    setView(next);
    setCameraKey((k) => k + 1);
  };

  const { selectedJoint } = state;
  const currentStep = state.technique.steps[state.stepIndex];
  const selectedPosition: Vec3 | null =
    selectedJoint && currentStep
      ? currentStep.pose.fighters[selectedJoint.fighter][selectedJoint.joint]
      : null;
  const moveSelected = (position: Vec3) => {
    if (selectedJoint) dispatch({ type: 'setJoint', joint: selectedJoint, position });
  };

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
  }, [input, save, state.revision, dispatch]);

  // Cmd/Ctrl+S saves instead of the browser's "save page"; Escape drops the selection.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'selectJoint', joint: null });
      // Inside a text field, Cmd/Ctrl+Z is the browser's own undo of the text.
      const target = event.target;
      const inField =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.metaKey || event.ctrlKey) && !inField) {
        const key = event.key.toLowerCase();
        if (key === 'z') {
          event.preventDefault();
          dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        } else if (key === 'y') {
          event.preventDefault();
          dispatch({ type: 'redo' });
        }
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSave, dispatch]);

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
            playing={playing}
            onStepChange={(index) => rawDispatch({ type: 'selectStep', index })}
            ghostPose={
              ghost && !playing ? (state.technique.steps[state.stepIndex - 1]?.pose ?? null) : null
            }
            view={view}
            cameraKey={cameraKey}
            selectedJoint={selectedJoint}
            onJointPointerDown={(joint) => dispatch({ type: 'selectJoint', joint })}
          >
            {!playing && selectedJoint && selectedPosition && (
              <JointGizmo
                position={selectedPosition}
                view={view}
                onBegin={() => dispatch({ type: 'beginJointDrag' })}
                onMove={moveSelected}
                onEnd={() => dispatch({ type: 'endJointDrag' })}
              />
            )}
            <CameraCapture captureRef={captureRef} />
          </TechniqueViewer>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <fieldset className="flex gap-1">
              <legend className="sr-only">Vue</legend>
              {VIEWS.map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={view === preset}
                  className={`rounded border px-3 py-1 text-sm ${
                    view === preset
                      ? 'border-emerald-700 bg-emerald-50 font-semibold'
                      : 'border-slate-300'
                  }`}
                  onClick={() => showView(preset)}
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-sm"
              onClick={() => setCameraKey((k) => k + 1)}
            >
              Recentrer
            </button>
            <button
              type="button"
              disabled={view !== 'step'}
              title={view === 'step' ? undefined : 'Passe en vue 3D pour choisir un angle'}
              className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
              onClick={() => {
                const camera = captureRef.current?.();
                if (camera) dispatch({ type: 'setStepCamera', camera });
              }}
            >
              Utiliser cet angle pour l'étape
            </button>
            {currentStep?.pose.camera && (
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 text-sm"
                onClick={() => dispatch({ type: 'setStepCamera', camera: undefined })}
              >
                Retirer l'angle
              </button>
            )}
          </div>
          {currentStep?.pose.camera && (
            <p className="mt-1 text-xs text-slate-600">
              Cette étape s'ouvre avec un angle conseillé.
            </p>
          )}
          <div className="mt-4">
            <PoseTools
              canUndo={state.history.past.length > 0}
              canRedo={state.history.future.length > 0}
              onUndo={() => dispatch({ type: 'undo' })}
              onRedo={() => dispatch({ type: 'redo' })}
              ghost={ghost}
              onGhost={setGhost}
              hasPrevious={state.stepIndex > 0}
              onCopyPrevious={() => dispatch({ type: 'copyPreviousPose' })}
              onMirror={(scope) => dispatch({ type: 'mirror', scope })}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              warnings={currentWarnings(state)}
            />
          </div>
          <div className="mt-4">
            <JointPanel
              selected={selectedJoint}
              position={selectedPosition}
              onSelect={(joint) => dispatch({ type: 'selectJoint', joint })}
              onMove={moveSelected}
            />
          </div>
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
