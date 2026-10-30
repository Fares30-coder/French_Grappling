import type { ReactNode } from 'react';

type ChipProps = {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** A filter pill: a toggle button (aria-pressed), 44 px high for touch. */
export function Chip({ pressed, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright ${
        pressed
          ? 'border-accent bg-accent-wash font-bold text-ink'
          : 'border-line-strong bg-surface text-ink-soft hover:border-line-stronger'
      }`}
    >
      {children}
    </button>
  );
}
