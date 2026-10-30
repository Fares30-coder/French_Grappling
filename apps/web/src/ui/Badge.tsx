import type { ReactNode } from 'react';

export type BadgeTone = 'sweep' | 'submission' | 'neutral';

const TONES: Record<BadgeTone, string> = {
  sweep: 'bg-accent-tint text-accent-soft font-mono uppercase tracking-[0.08em] text-[11px]',
  submission:
    'bg-opponent-tint text-opponent-soft font-mono uppercase tracking-[0.08em] text-[11px]',
  neutral: 'border border-line-strong text-ink-soft text-[13px]',
};

/** A small label: technique category (sweep / submission tones) or level, gi... (neutral). */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 leading-none ${TONES[tone]}`}>
      {children}
    </span>
  );
}
