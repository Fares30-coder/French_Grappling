import type { ReactNode } from 'react';

/** Small spaced capitals above a title ("TON ESPACE D'APPRENTISSAGE"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-[13px] uppercase tracking-[0.22em] text-accent-bright">{children}</p>
  );
}

/** Monospace tag ("01 / EXPLORER", "ÉTAPE 4 / 6"). */
export function MonoLabel({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs tracking-[0.06em] text-accent-bright">{children}</span>;
}

/** Page header: eyebrow, h1, optional lead. */
export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="flex flex-col gap-2.5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="m-0 text-4xl font-bold tracking-[-0.02em] md:text-[44px]">{title}</h1>
      {lead && <p className="m-0 text-[17px] text-ink-muted">{lead}</p>}
    </header>
  );
}
