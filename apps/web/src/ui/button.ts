export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-5 font-bold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-bright',
  secondary: 'border border-line-stronger text-ink hover:border-accent hover:text-ink',
  ghost: 'text-ink-muted hover:bg-surface hover:text-ink',
};

/** Classes of a button or of a link styled as one (same look for <button>, <a> and <Link>). */
export const buttonClass = (variant: ButtonVariant = 'primary', extra = ''): string =>
  `${BASE} ${VARIANTS[variant]} ${extra}`.trim();
