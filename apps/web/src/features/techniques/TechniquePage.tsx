import { useParams } from 'react-router';
import { ApiRequestError } from '../../lib/api';
import { TechniqueViewer } from '../viewer/TechniqueViewer';
import { useTechnique } from './use-technique';

export function TechniquePage() {
  const { slug = '' } = useParams();
  const { data, error, isPending } = useTechnique(slug);

  if (isPending) return <p className="p-6 text-slate-600">Chargement…</p>;

  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <p className="p-6 text-slate-800">
        {notFound ? 'Technique introuvable' : 'Une erreur est survenue. Réessaie plus tard.'}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">{data.name}</h1>

      <TechniqueViewer
        className="mt-4 aspect-video w-full overflow-hidden rounded-lg"
        steps={data.steps}
        stepIndex={0}
      />

      <h2 className="mt-6 text-xl font-semibold">Étapes</h2>
      <ol className="mt-2 list-decimal pl-6">
        {data.steps.map((step) => (
          <li key={step.order}>{step.title}</li>
        ))}
      </ol>

      <h2 className="mt-6 text-xl font-semibold">Points clés</h2>
      <ul className="mt-2 list-disc pl-6">
        {data.keyPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </main>
  );
}
