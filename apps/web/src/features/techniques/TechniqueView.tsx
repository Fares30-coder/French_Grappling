import {
  CATEGORY_LABELS_FR,
  CHAIN_TYPE_LABELS_FR,
  GI_MODE_LABELS_FR,
  LEVEL_LABELS_FR,
  type TechniqueDetail,
} from '@tatamap/shared';
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../ui/Badge';
import { buttonClass } from '../../ui/button';
import { PUBLIC_SCENE } from '../viewer/theme';

// three.js is loaded with the viewer, after the text: it never weighs on the first paint.
const TechniqueViewer = lazy(() =>
  import('../viewer/TechniqueViewer').then((m) => ({ default: m.TechniqueViewer })),
);

const SPEEDS = [0.5, 1, 1.5] as const;
type Speed = (typeof SPEEDS)[number];
const speedLabel = (s: Speed) => `${String(s).replace('.', ',')}×`;

const CATEGORY_PLURALS_FR: Record<TechniqueDetail['category'], string> = {
  submission: 'Soumissions',
  pass: 'Passages de garde',
  sweep: 'Renversements',
  escape: 'Sorties',
  takedown: 'Projections',
};

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright';
const iconButton = `inline-flex size-11 items-center justify-center rounded-[10px] border border-line-strong bg-surface text-ink hover:border-line-stronger ${focusRing}`;

function Icon({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'good' | 'bad';
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="m-0 mb-3.5 text-xl font-bold">{title}</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`mt-0.5 shrink-0 ${tone === 'good' ? 'stroke-accent-bright' : 'stroke-opponent-bright'}`}
            >
              {tone === 'good' ? <path d="M5 12l5 5L19 7" /> : <path d="M6 6l12 12M18 6L6 18" />}
            </svg>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

type TechniqueViewProps = {
  technique: TechniqueDetail;
  /** Step shown first (0-based), e.g. from `?etape=` in the URL. */
  initialStep?: number;
  /** Called when the user picks a step (not on playback), to mirror it in the URL. */
  onStepPicked?: (index: number) => void;
};

/**
 * The body of the public technique page. Presentational (the technique comes in props), so the
 * admin preview renders exactly what the public page will show.
 */
export function TechniqueView({
  technique: data,
  initialStep = 0,
  onStepPicked,
}: TechniqueViewProps) {
  const lastStep = data.steps.length - 1;
  const [stepIndex, setStepIndex] = useState(() => Math.min(Math.max(initialStep, 0), lastStep));
  // A deep link to a step opens paused on it; otherwise the technique plays.
  const [playing, setPlaying] = useState(initialStep === 0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [cameraKey, setCameraKey] = useState(0);
  const viewerRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const goToStep = (index: number) => {
    const next = Math.min(Math.max(index, 0), lastStep);
    setPlaying(false);
    setStepIndex(next);
    onStepPicked?.(next);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewerRef.current?.requestFullscreen();
  };

  const currentStep = data.steps[stepIndex];
  const category = CATEGORY_LABELS_FR[data.category];

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-7 bg-ground px-4 py-6 text-ink md:px-14 md:py-10">
      <header className="flex flex-col gap-3">
        <nav aria-label="Fil d'Ariane" className="text-sm text-ink-muted">
          <Link to="/bibliotheque" className={`rounded text-ink-muted hover:text-ink ${focusRing}`}>
            Bibliothèque
          </Link>
          {' › '}
          <Link
            to={`/bibliotheque?categorie=${data.category}`}
            className={`rounded text-ink-muted hover:text-ink ${focusRing}`}
          >
            {CATEGORY_PLURALS_FR[data.category]}
          </Link>
        </nav>
        <h1 className="m-0 text-3xl font-bold tracking-[-0.02em] md:text-[40px]">{data.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={data.category === 'submission' ? 'submission' : 'sweep'}>{category}</Badge>
          <Badge>{LEVEL_LABELS_FR[data.level]}</Badge>
          <Badge>{GI_MODE_LABELS_FR[data.gi]}</Badge>
          <span className="ml-1 text-[15px] text-ink-muted">
            <Link
              to={`/bibliotheque?position=${data.startPosition.slug}`}
              className={`rounded text-ink-soft hover:text-ink ${focusRing}`}
            >
              {data.startPosition.name}
            </Link>
            {data.endPosition && <> → {data.endPosition.name}</>}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <section
          ref={viewerRef}
          aria-label="Animation 3D"
          className={`min-w-0 flex-[2_1_560px] overflow-hidden border-line bg-surface-sunken ${
            fullscreen ? 'flex h-dvh flex-col' : 'rounded-2xl border'
          }`}
        >
          <div
            className={`relative ${fullscreen ? 'min-h-0 flex-1' : 'aspect-[4/3] sm:aspect-video'}`}
          >
            <Suspense fallback={<div className="absolute inset-0 bg-surface-sunken" />}>
              <TechniqueViewer
                className="absolute inset-0"
                background={PUBLIC_SCENE.background}
                tatamiColor={PUBLIC_SCENE.tatami}
                steps={data.steps}
                stepIndex={stepIndex}
                playing={playing}
                speed={speed}
                onStepChange={setStepIndex}
                cameraKey={cameraKey}
                followStepCamera
              />
            </Suspense>
            <span className="pointer-events-none absolute top-3 left-3 rounded-lg border border-line-stronger bg-surface-sunken/80 px-2.5 py-1.5 font-mono text-xs text-ink-soft">
              <span className="text-accent-bright">TOI</span> /{' '}
              <span className="text-opponent-bright">ADVERSAIRE</span>
            </span>
            <span className="pointer-events-none absolute top-3.5 right-3 font-mono text-xs text-ink-soft">
              ÉTAPE {stepIndex + 1} / {data.steps.length}
            </span>
            <span className="pointer-events-none absolute right-3 bottom-2.5 text-[13px] text-ink-muted">
              Glisse pour tourner ↔
            </span>
          </div>

          <div className="flex flex-col gap-3.5 border-t border-line px-4 pt-3.5 pb-4 md:px-5">
            <div className="flex gap-1.5">
              {data.steps.map((step, i) => (
                <button
                  key={step.order}
                  type="button"
                  aria-label={`Étape ${step.order} : ${step.title}`}
                  aria-current={i === stepIndex ? 'step' : undefined}
                  onClick={() => goToStep(i)}
                  className={`group flex h-6 flex-1 items-center rounded ${focusRing}`}
                >
                  <span
                    className={`h-1.5 w-full rounded-full transition-colors ${
                      i <= stepIndex ? 'bg-accent' : 'bg-line-strong group-hover:bg-line-stronger'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                aria-label="Étape précédente"
                className={iconButton}
                disabled={stepIndex === 0}
                onClick={() => goToStep(stepIndex - 1)}
              >
                <Icon>
                  <path d="M6 5v14M19 5l-9 7 9 7z" />
                </Icon>
              </button>
              <button
                type="button"
                aria-label={playing ? 'Pause' : 'Lecture'}
                className={`inline-flex size-13 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-bright ${focusRing}`}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? (
                  <Icon filled>
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </Icon>
                ) : (
                  <Icon filled>
                    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" />
                  </Icon>
                )}
              </button>
              <button
                type="button"
                aria-label="Étape suivante"
                className={iconButton}
                disabled={stepIndex === lastStep}
                onClick={() => goToStep(stepIndex + 1)}
              >
                <Icon>
                  <path d="M18 5v14M5 5l9 7-9 7z" />
                </Icon>
              </button>
              <fieldset className="m-0 ml-1 flex overflow-hidden rounded-[10px] border border-line-strong p-0">
                <legend className="sr-only">Vitesse</legend>
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={s === speed}
                    onClick={() => setSpeed(s)}
                    className={`h-11 min-w-11 text-sm sm:min-w-13 ${focusRing} ${
                      s === speed ? 'bg-accent-wash font-bold text-ink' : 'bg-surface text-ink-soft'
                    }`}
                  >
                    {speedLabel(s)}
                  </button>
                ))}
              </fieldset>
              <div className="ml-auto flex gap-2.5">
                <button
                  type="button"
                  aria-label="Recentrer la caméra"
                  className={buttonClass('secondary', 'px-3 text-sm sm:px-3.5')}
                  onClick={() => setCameraKey((k) => k + 1)}
                >
                  <Icon>
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </Icon>
                  <span className="hidden sm:inline">Recentrer</span>
                </button>
                {canFullscreen && (
                  <button
                    type="button"
                    aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                    aria-pressed={fullscreen}
                    className={iconButton}
                    onClick={toggleFullscreen}
                  >
                    <Icon>
                      {fullscreen ? (
                        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                      ) : (
                        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                      )}
                    </Icon>
                  </button>
                )}
              </div>
            </div>
            {fullscreen && currentStep && (
              <p className="m-0 text-lg">
                <span className="font-mono text-accent-bright">{currentStep.order}.</span>{' '}
                {currentStep.title}
              </p>
            )}
          </div>
        </section>

        <section
          aria-labelledby="etapes"
          className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5"
        >
          <h2 id="etapes" className="m-0 mb-1 text-xl font-bold">
            Étapes
          </h2>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {data.steps.map((step, i) => {
              const current = i === stepIndex;
              return (
                <li key={step.order}>
                  <button
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    onClick={() => goToStep(i)}
                    className={`flex min-h-11 w-full gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] leading-snug ${focusRing} ${
                      current
                        ? 'border-accent bg-accent-wash text-ink'
                        : 'border-line bg-surface text-ink-soft hover:border-line-strong'
                    }`}
                  >
                    <span
                      className={`inline-flex size-6.5 shrink-0 items-center justify-center rounded-full font-mono text-xs ${
                        current
                          ? 'bg-accent text-on-accent'
                          : 'border border-line-stronger text-ink-soft'
                      }`}
                    >
                      {step.order}
                    </span>
                    <span className="flex flex-col gap-1.5">
                      <span>{step.title}</span>
                      {current && step.text && <span className="text-ink-muted">{step.text}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5">
        <ListCard title="Points clés" items={data.keyPoints} tone="good" />
        <ListCard title="Erreurs fréquentes" items={data.commonMistakes} tone="bad" />
      </div>

      {data.chains.length > 0 && (
        <section aria-labelledby="enchainements" className="flex flex-col gap-3.5">
          <h2 id="enchainements" className="m-0 text-xl font-bold">
            Enchaînements
          </h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3 p-0">
            {data.chains.map((chain) => (
              <li key={`${chain.type}-${chain.technique.slug}`} className="flex">
                <Link
                  to={`/techniques/${chain.technique.slug}`}
                  className={`flex w-full flex-col gap-1.5 rounded-2xl border border-line bg-surface px-5 py-4 text-ink no-underline hover:border-line-stronger ${focusRing}`}
                >
                  <span className="font-mono text-[11px] tracking-[0.08em] text-accent-bright uppercase">
                    {CHAIN_TYPE_LABELS_FR[chain.type]}
                  </span>
                  <span className="text-[17px] font-bold">{chain.technique.name}</span>
                  <span className="text-[13px] text-ink-muted">
                    {CATEGORY_LABELS_FR[chain.technique.category]} ·{' '}
                    {LEVEL_LABELS_FR[chain.technique.level]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
