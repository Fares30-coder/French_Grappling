import { Navigate, Outlet, useLocation } from 'react-router';
import { isUnauthorized, useAdminSession } from '../api';

/** Route guard: asks the API who is logged in (the cookie is HttpOnly, the front cannot read it). */
export function RequireAdmin() {
  const session = useAdminSession();
  const location = useLocation();

  if (session.isPending) return <p className="p-6 text-slate-600">Chargement…</p>;
  if (session.error) {
    if (isUnauthorized(session.error)) {
      const next = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/admin/login?next=${next}`} replace />;
    }
    return (
      <div className="p-6">
        <p className="text-slate-800">Impossible de joindre l'API.</p>
        <button
          type="button"
          className="mt-3 rounded border border-slate-300 px-3 py-1.5"
          onClick={() => session.refetch()}
        >
          Réessayer
        </button>
      </div>
    );
  }
  return <Outlet />;
}
