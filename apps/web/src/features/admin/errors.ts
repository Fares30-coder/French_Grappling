import { ApiRequestError } from '../../lib/api';

/** French message for an admin API failure (the API's own messages are English). */
export function adminErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'Une erreur est survenue. Réessaie plus tard.';
  switch (error.reason) {
    case 'version_mismatch':
      return 'Modifiée ailleurs (autre onglet).';
    case 'slug_taken':
      return 'Ce slug est déjà utilisé.';
    case 'slug_locked':
      return "Le slug d'une technique publiée est figé : dépublie-la d'abord pour le changer.";
    case 'not_publishable':
      return "La technique n'est pas publiable (2 étapes et 1 point clé minimum).";
    case 'unknown_reference':
      return "Une position, un tag ou une technique liée n'existe plus. Recharge la page.";
    case 'self_chain':
      return "Une technique ne peut pas s'enchaîner avec elle-même.";
    case 'still_published':
      return 'Dépublie la technique avant de la supprimer.';
    case undefined:
      break;
  }
  switch (error.status) {
    case 0:
      return 'Impossible de joindre le serveur.';
    case 400:
      return 'Données invalides.';
    case 401:
      return 'Session expirée : reconnecte-toi dans un autre onglet puis réessaie.';
    case 403:
      return 'Requête refusée (ouvre le site sur http://localhost, pas 127.0.0.1).';
    case 404:
      return 'Introuvable (supprimée ailleurs ?).';
    case 413:
      return 'Technique trop volumineuse.';
    case 429:
      return 'Trop de requêtes, réessaie dans quelques minutes.';
    default:
      return 'Une erreur est survenue. Réessaie plus tard.';
  }
}
