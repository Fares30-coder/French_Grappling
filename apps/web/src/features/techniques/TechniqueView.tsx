import type { TechniqueDetail } from '@tatamap/shared';
import { useState } from 'react';
import { buttonClass } from '../../ui/button';
import { TechniqueViewer } from '../viewer/TechniqueViewer';

const SPEEDS = [0.5, 1, 2] as const;
type Speed = (typeof SPEEDS)[number];

const speedLabel = (s: Speed) => `${String(s).replace('.', ',')}×`;

/**
 * The body of the public technique page. Presentational (the technique comes in props), so the
 * admin preview renders exactly what the public page will show.
 */
export function TechniqueView({ technique: data }: { technique: TechniqueDetail }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [cameraKey, setCameraKey] = useState(0);

  const currentStep = data.steps[stepIndex];

  const goToStep = (index: number) => {
    setPlaying(false);
    setStepIndex(index);
  };

  return (
    <main className="mx-auto max-w-3xl bg-ground p-4 text-ink md:p-6">
      <h1 className="text-3xl font-bold">{data.name}</h1>

      <TechniqueViewer
        className="mt-4 aspect-video w-full overflow-hidden rounded-2xl border border-line"
        background="#121f24"
        steps={data.steps}
        stepIndex={stepIndex}
        playing={playing}
        speed={speed}
        onStepChange={setStepIndex}
        cameraKey={cameraKey}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass('primary')}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? 'Pause' : 'Lecture'}
        </button>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Vitesse</legend>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === speed}
              className={`min-h-11 rounded-[10px] border px-3 ${
                s === speed
                  ? 'border-accent bg-accent-wash font-bold text-ink'
                  : 'border-line-strong bg-surface text-ink-soft'
              }`}
              onClick={() => setSpeed(s)}
            >
              {speedLabel(s)}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          className={buttonClass('secondary')}
          onClick={() => setCameraKey((k) => k + 1)}
        >
          Recentrer
        </button>
      </div>

      <h2 className="mt-6 text-xl font-semibold">Étapes</h2>
      <ol className="mt-2 space-y-2">
        {data.steps.map((step, i) => (
          <li key={step.order}>
            <button
              type="button"
              aria-current={i === stepIndex ? 'step' : undefined}
              className={`min-h-11 w-full rounded-xl border px-3.5 py-2.5 text-left ${
                i === stepIndex
                  ? 'border-accent bg-accent-wash font-semibold text-ink'
                  : 'border-line bg-surface text-ink-soft hover:border-line-strong'
              }`}
              onClick={() => goToStep(i)}
            >
              {step.order}. {step.title}
            </button>
          </li>
        ))}
      </ol>
      {currentStep?.text && <p className="mt-3 text-ink-muted">{currentStep.text}</p>}

      <h2 className="mt-6 text-xl font-semibold">Points clés</h2>
      <ul className="mt-2 list-disc pl-6">
        {data.keyPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      <h2 className="mt-6 text-xl font-semibold">Erreurs fréquentes</h2>
      <ul className="mt-2 list-disc pl-6">
        {data.commonMistakes.map((mistake) => (
          <li key={mistake}>{mistake}</li>
        ))}
      </ul>
    </main>
  );
}
