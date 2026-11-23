import type { ReactNode } from 'react';

/** A legal field not yet configured: loud on purpose, so it cannot go live unnoticed. */
export function LegalValue({ value, label }: { value: ReactNode | null; label: string }) {
  if (value) return <>{value}</>;
  return (
    <mark className="rounded bg-accent-tint px-1.5 py-0.5 font-mono text-sm text-ink">
      [À COMPLÉTER : {label}]
    </mark>
  );
}
