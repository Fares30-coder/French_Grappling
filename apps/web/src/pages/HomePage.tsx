import { Link } from 'react-router';
import { buttonClass } from '../ui/button';
import { Eyebrow } from '../ui/text';

// Provisional home (phase 3, lot 1): the real one (3D demo, strengths, clubs) comes in lot 5.
export function HomePage() {
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-10 md:px-16 md:py-18">
      <Eyebrow>Apprends autrement</Eyebrow>
      <h1 className="m-0 max-w-[14em] text-4xl leading-[1.05] font-bold tracking-[-0.02em] md:text-[52px]">
        Le jiu-jitsu, en 3D et en français
      </h1>
      <p className="m-0 max-w-[34em] text-lg leading-relaxed text-ink-muted">
        Chaque technique décomposée étape par étape, à regarder sous tous les angles.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link to="/bibliotheque" className={buttonClass('primary')}>
          Explorer la bibliothèque
        </Link>
        <Link to="/techniques/ciseau-garde-fermee" className={buttonClass('secondary')}>
          Voir le ciseau
        </Link>
      </div>
      {/* Dev only: the admin has no public entry point. */}
      {import.meta.env.DEV && (
        <p className="mt-6 text-sm">
          <Link className="text-ink-faint underline" to="/admin">
            Admin
          </Link>
        </p>
      )}
    </main>
  );
}
