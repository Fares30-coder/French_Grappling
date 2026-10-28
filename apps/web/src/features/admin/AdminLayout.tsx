import { APP_NAME } from '@tatamap/shared';
import { Link, Outlet, useNavigate } from 'react-router';
import { useAdminSession, useLogout } from './api';

export function AdminLayout() {
  const session = useAdminSession();
  const logout = useLogout();
  const navigate = useNavigate();

  const onLogout = () =>
    logout.mutate(undefined, { onSettled: () => navigate('/admin/login', { replace: true }) });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-6 py-3">
        <Link to="/admin/techniques" className="font-bold">
          {APP_NAME} · admin
        </Link>
        <span className="ml-auto text-sm text-slate-600">{session.data?.email}</span>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          disabled={logout.isPending}
          onClick={onLogout}
        >
          Se déconnecter
        </button>
      </header>
      <Outlet />
    </div>
  );
}
