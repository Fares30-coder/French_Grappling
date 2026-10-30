import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { buttonClass } from '../ui/button';
import { PageHeader } from '../ui/text';

const pageClass = 'mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-10 md:px-16 md:py-14';

export function NotFoundPage() {
  return (
    <main className={pageClass}>
      <PageHeader
        eyebrow="Erreur 404"
        title="Page introuvable"
        lead="Cette page n'existe pas, ou plus."
      />
      <Link to="/bibliotheque" className={buttonClass('primary', 'self-start')}>
        Retour à la bibliothèque
      </Link>
    </main>
  );
}

/** Router error element of the public pages (a crash or a 404 thrown by a loader). */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <main className={pageClass}>
      <PageHeader
        eyebrow="Oups"
        title="Une erreur est survenue"
        lead="Recharge la page ; si le problème continue, réessaie plus tard."
      />
      <Link to="/" className={buttonClass('primary', 'self-start')}>
        Retour à l'accueil
      </Link>
    </main>
  );
}
