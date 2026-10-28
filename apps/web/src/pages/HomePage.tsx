import { APP_NAME } from '@tatamap/shared';
import { Link } from 'react-router';

export function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">{APP_NAME}</h1>
      <p className="mt-4">
        <Link className="text-emerald-700 underline" to="/techniques/ciseau-garde-fermee">
          Voir le ciseau depuis la garde fermée
        </Link>
      </p>
    </main>
  );
}
