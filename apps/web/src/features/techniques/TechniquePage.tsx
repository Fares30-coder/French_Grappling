import { useParams } from 'react-router';
import { ApiRequestError } from '../../lib/api';
import { TechniqueView } from './TechniqueView';
import { useTechnique } from './use-technique';

export function TechniquePage() {
  const { slug = '' } = useParams();
  const { data, error, isPending } = useTechnique(slug);

  if (isPending) return <p className="p-6 text-ink-muted">Chargement…</p>;

  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <p className="p-6 text-ink">
        {notFound ? 'Technique introuvable' : 'Une erreur est survenue. Réessaie plus tard.'}
      </p>
    );
  }

  return <TechniqueView technique={data} />;
}
