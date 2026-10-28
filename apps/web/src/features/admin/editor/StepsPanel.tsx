import { DEFAULT_TRANSITION_MS } from '@tatamap/shared';
import { type EditorAction, type EditorStep, MAX_STEPS } from './editor-state';
import type { FieldErrors } from './validation';

type Props = {
  steps: ReadonlyArray<EditorStep>;
  stepIndex: number;
  errors: FieldErrors;
  dispatch: (action: EditorAction) => void;
};

const field = 'mt-1 w-full rounded border border-slate-300 px-3 py-1.5';

export function StepsPanel({ steps, stepIndex, errors, dispatch }: Props) {
  const current = steps[stepIndex];
  return (
    <section aria-label="Étapes" className="space-y-3">
      <h2 className="text-lg font-semibold">Étapes</h2>
      <ol className="space-y-1">
        {steps.map((step, i) => {
          const hasError = Object.keys(errors).some((k) => k.startsWith(`steps.${i}.`));
          return (
            // The order is the identity of a step.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <li key={i} className="flex items-center gap-1">
              <button
                type="button"
                aria-current={i === stepIndex ? 'step' : undefined}
                className={`flex-1 truncate rounded px-3 py-1.5 text-left ${
                  i === stepIndex ? 'bg-emerald-100 font-semibold' : 'hover:bg-slate-100'
                } ${hasError ? 'ring-1 ring-red-500' : ''}`}
                onClick={() => dispatch({ type: 'selectStep', index: i })}
              >
                {i + 1}. {step.title || '(sans titre)'}
              </button>
              <button
                type="button"
                aria-label={`Monter l'étape ${i + 1}`}
                disabled={i === 0}
                className="rounded px-2 py-1 disabled:opacity-30"
                onClick={() => dispatch({ type: 'moveStep', index: i, direction: -1 })}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Descendre l'étape ${i + 1}`}
                disabled={i === steps.length - 1}
                className="rounded px-2 py-1 disabled:opacity-30"
                onClick={() => dispatch({ type: 'moveStep', index: i, direction: 1 })}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Supprimer l'étape ${i + 1}`}
                disabled={steps.length <= 1}
                className="rounded px-2 py-1 text-red-700 disabled:opacity-30"
                onClick={() => dispatch({ type: 'removeStep', index: i })}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={steps.length >= MAX_STEPS}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
        onClick={() => dispatch({ type: 'addStepAfter' })}
      >
        Ajouter une étape
      </button>

      {current && (
        <div className="space-y-3 rounded border border-slate-200 p-3">
          <label className="block">
            <span className="text-sm font-medium">Titre de l'étape {stepIndex + 1}</span>
            <input
              className={field}
              value={current.title}
              onChange={(e) =>
                dispatch({
                  type: 'setStepField',
                  index: stepIndex,
                  field: 'title',
                  value: e.target.value,
                })
              }
            />
            {errors[`steps.${stepIndex}.title`] && (
              <span className="text-sm text-red-700">{errors[`steps.${stepIndex}.title`]}</span>
            )}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Texte</span>
            <textarea
              rows={3}
              className={field}
              value={current.text}
              onChange={(e) =>
                dispatch({
                  type: 'setStepField',
                  index: stepIndex,
                  field: 'text',
                  value: e.target.value,
                })
              }
            />
            {errors[`steps.${stepIndex}.text`] && (
              <span className="text-sm text-red-700">{errors[`steps.${stepIndex}.text`]}</span>
            )}
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Durée de la transition vers cette étape (ms, défaut {DEFAULT_TRANSITION_MS})
            </span>
            <input
              type="number"
              min={100}
              max={10000}
              step={100}
              className={field}
              value={Number.isFinite(current.transitionMs) ? current.transitionMs : ''}
              onChange={(e) =>
                dispatch({
                  type: 'setStepField',
                  index: stepIndex,
                  field: 'transitionMs',
                  value: Math.round(Number(e.target.value)),
                })
              }
            />
            {errors[`steps.${stepIndex}.transitionMs`] && (
              <span className="text-sm text-red-700">
                {errors[`steps.${stepIndex}.transitionMs`]}
              </span>
            )}
          </label>
        </div>
      )}
    </section>
  );
}
