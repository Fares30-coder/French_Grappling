import { lazy, type ReactNode, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CONTACT_EMAIL, DEMO_TECHNIQUE_SLUG } from '../../config';
import { buttonClass } from '../../ui/button';
import { Eyebrow, MonoLabel } from '../../ui/text';
import { usePositions, useTechniqueList } from '../library/use-catalog';
import { useTechnique } from '../techniques/use-technique';
import { PUBLIC_SCENE } from '../viewer/theme';

// three.js loads after the text: the demo never delays the first paint.
const TechniqueViewer = lazy(() =>
  import('../viewer/TechniqueViewer').then((m) => ({ default: m.TechniqueViewer })),
);

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && window.matchMedia(query).matches;

/** A technique looping in 3D. Orientable with a mouse; on touch screens a drag must scroll. */
function HeroDemo() {
  const { data } = useTechnique(DEMO_TECHNIQUE_SLUG);
  const [canHover] = useState(() => matches('(hover: hover)'));
  const [reducedMotion] = useState(() => matches('(prefers-reduced-motion: reduce)'));
  const steps = useMemo(
    () => data?.steps.map((s) => ({ pose: s.pose, transitionMs: s.transitionMs })) ?? [],
    [data],
  );

  return (
    <figure className="relative m-0 aspect-[16/13] overflow-hidden rounded-[20px] border border-line bg-surface-sunken">
      {steps.length > 0 && (
        <Suspense fallback={null}>
          <TechniqueViewer
            className="absolute inset-0"
            background={PUBLIC_SCENE.background}
            tatamiColor={PUBLIC_SCENE.tatami}
            steps={steps}
            stepIndex={0}
            playing={!reducedMotion}
            interactive={canHover}
            followStepCamera
          />
        </Suspense>
      )}
      <span className="pointer-events-none absolute top-4 left-4 rounded-lg border border-line-stronger bg-surface-sunken/80 px-2.5 py-1.5 font-mono text-xs text-ink-soft">
        <span className="text-accent-bright">TOI</span> /{' '}
        <span className="text-opponent-bright">ADVERSAIRE</span>
      </span>
      <figcaption className="absolute right-4 bottom-3.5 flex items-center gap-3 text-[13px] text-ink-muted">
        {canHover && <span className="pointer-events-none">Glisse pour tourner ↔</span>}
        {data && (
          <Link
            to={`/techniques/${data.slug}`}
            className="rounded font-bold text-accent-bright hover:text-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright"
          >
            {data.name} →
          </Link>
        )}
      </figcaption>
    </figure>
  );
}

function Strength({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-6 md:p-7">
      <p className="m-0 mb-3">
        <MonoLabel>{label}</MonoLabel>
      </p>
      <h2 className="m-0 text-2xl font-bold">{title}</h2>
      <p className="m-0 text-[15px] leading-relaxed text-ink-muted">{children}</p>
    </article>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col border-t-2 border-accent pt-3">
      <dt className="order-2 text-[13px] text-ink-muted md:text-base">{label}</dt>
      <dd className="order-1 m-0 text-[32px] leading-tight font-bold md:text-[44px]">{value}</dd>
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 stroke-accent-bright"
      >
        <path d="M5 12l5 5L19 7" />
      </svg>
      {children}
    </li>
  );
}

export function HomePage() {
  const list = useTechniqueList();
  const positions = usePositions();
  const guards = positions.data?.positions.filter((p) => p.role === 'bottom').length;

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-14 px-4 py-10 md:px-16 md:py-18">
      <title>Tatamap · Le jiu-jitsu en 3D et en français</title>
      <meta
        name="description"
        content="Techniques de jiu-jitsu brésilien et de grappling en français, décomposées étape par étape en 3D orientable, et la carte des positions qui les relie."
      />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-10 md:gap-12">
        <div className="flex flex-col gap-5">
          <Eyebrow>Apprends autrement</Eyebrow>
          <h1 className="m-0 text-4xl leading-[1.05] font-bold tracking-[-0.02em] md:text-[52px]">
            Le jiu-jitsu, en 3D et en français
          </h1>
          <p className="m-0 max-w-[34em] text-lg leading-relaxed text-ink-muted">
            Chaque technique décomposée étape par étape, à regarder sous tous les angles.
            Soumissions, renversements, prises du dos : tout part d'une position et mène à une
            autre.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link to="/bibliotheque" className={buttonClass('primary')}>
              Explorer la bibliothèque
            </Link>
            <Link to="/carte" className={buttonClass('secondary')}>
              Voir la carte des positions
            </Link>
          </div>
        </div>
        <HeroDemo />
      </section>

      <div className="h-px bg-line" />

      <section
        aria-label="Pourquoi Tatamap"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-5"
      >
        <Strength label="01 / EXPLORER" title="3D orientable">
          Tourne autour de la technique, ralentis-la, rejoue chaque étape.
        </Strength>
        <Strength label="02 / COMPRENDRE" title="En français">
          Des explications claires, étape par étape, avec les points clés et les erreurs fréquentes.
        </Strength>
        <Strength label="03 / PROGRESSER" title="La carte des positions">
          Vois comment tout s'enchaîne : chaque position est un lieu, chaque technique un chemin.
        </Strength>
      </section>

      {list.data && positions.data && guards !== undefined && (
        <dl aria-label="Le contenu" className="m-0 grid grid-cols-3 gap-3 md:gap-5">
          <Figure value={list.data.techniques.length} label="techniques animées" />
          <Figure value={positions.data.positions.length} label="positions reliées" />
          <Figure value={guards} label="gardes" />
        </dl>
      )}

      <section
        aria-labelledby="clubs"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-8 rounded-[20px] border border-line bg-surface p-6 md:p-10"
      >
        <div className="flex flex-col gap-3.5">
          <Eyebrow>Pour les clubs</Eyebrow>
          <h2 id="clubs" className="m-0 text-3xl leading-tight font-bold md:text-[34px]">
            Un support pour tes cours
          </h2>
          <p className="m-0 text-[17px] leading-relaxed text-ink-muted">
            Montre la technique sous tous les angles, sur l'écran du dojo ou le téléphone de tes
            élèves, puis laisse-les la revoir à la maison.
          </p>
        </div>
        <div className="flex flex-col items-start gap-4">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-base">
            <Check>Plein écran pour projeter, pause sur chaque étape</Check>
            <Check>Un lien direct vers chaque étape à partager</Check>
            <Check>Le même vocabulaire pour tout le club</Check>
          </ul>
          <a href={`mailto:${CONTACT_EMAIL}`} className={buttonClass('primary', 'mt-1.5')}>
            Nous contacter
          </a>
        </div>
      </section>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-line pt-5 text-[13px] text-ink-faint">
        <span>© {new Date().getFullYear()} Tatamap · Créé par Fares Haouari</span>
        {/* Dev only: the admin has no public entry point. */}
        {import.meta.env.DEV && (
          <Link className="text-ink-faint underline" to="/admin">
            Admin
          </Link>
        )}
      </footer>
    </main>
  );
}
