import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { loginErrorMessage, useAdminSession, useLogin } from '../api';
import { safeNext } from './safe-next';

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const session = useAdminSession();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Already logged in: nothing to do here.
  if (session.data) return <Navigate to={next} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate(next, { replace: true }) },
    );
  };

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-bold">Connexion admin</h1>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {login.isError && (
          <p role="alert" className="text-sm text-red-700">
            {loginErrorMessage(login.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {login.isPending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
