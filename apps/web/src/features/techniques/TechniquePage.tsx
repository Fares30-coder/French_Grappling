import { Link, useParams, useSearchParams } from 'react-router';
import { ApiRequestError } from '../../lib/api';
import { buttonClass } from '../../ui/button';
import { PageHeader } from '../../ui/text';
import { TechniqueView } from './TechniqueView';
import { useTechnique } from './use-technique';

/** `?etape=3` (1-based, as shown on screen) -> 2; anything else -> 0. */
export function stepFromParam(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0;
}

export function TechniquePage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useTechnique(slug);

  if (isPending) {
    return (
      <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-6 md:px-14 md:py-10">
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-surface" />
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-surface md:w-2/3" />
      </main>
    );
  }

  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-10 md:px-16 md:py-14">
        <title>{`${notFound ? 'Technique introuvable' : 'Erreur'} · Tatamap`}</title>
        <PageHeader
          eyebrow={notFound ? 'Erreur 404' : 'Oups'}
          title={notFound ? 'Technique introuvable' : 'Une erreur est survenue'}
          lead={
            notFound
              ? "Cette technique n'existe pas, ou n'est plus publiée."
              : 'La technique n’a pas pu être chargée.'
          }
        />
        <div className="flex flex-wrap gap-3">
          {!notFound && (
            <button type="button" className={buttonClass('primary')} onClick={() => refetch()}>
              Réessayer
            </button>
          )}
          <Link to="/bibliotheque" className={buttonClass(notFound ? 'primary' : 'secondary')}>
            Retour à la bibliothèque
          </Link>
        </div>
      </main>
    );
  }

  const description = `${data.name} : ${data.steps.length} étapes animées en 3D, points clés et erreurs fréquentes.`;
  return (
    <>
      <title>{`${data.name} · Tatamap`}</title>
      <meta name="description" content={description} />
      <TechniqueView
        technique={data}
        initialStep={stepFromParam(params.get('etape'))}
        onStepPicked={(i) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (i === 0) next.delete('etape');
              else next.set('etape', String(i + 1));
              return next;
            },
            { replace: true },
          )
        }
      />
    </>
  );
}
