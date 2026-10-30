import type { ReactNode } from 'react';

export type NavItem = {
  to: string;
  label: string;
  /** Short label for the phone tab bar. */
  shortLabel: string;
  icon: ReactNode;
  /** Other paths under which this entry is the current one (a technique belongs to the library). */
  alsoActiveFor?: string[];
};

/** Decorative stroke icon (the label is always written next to it). */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Accueil',
    shortLabel: 'Accueil',
    icon: (
      <Icon>
        <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
      </Icon>
    ),
  },
  {
    to: '/bibliotheque',
    label: 'Bibliothèque',
    shortLabel: 'Bibliothèque',
    alsoActiveFor: ['/techniques/'],
    icon: (
      <Icon>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </Icon>
    ),
  },
  {
    to: '/carte',
    label: 'Carte des positions',
    shortLabel: 'Carte',
    icon: (
      <Icon>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8.5 6h7M8 8l8 8M6 8.5v7" />
      </Icon>
    ),
  },
];

/** Whether `item` is the current entry for `pathname`. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return (
    pathname === item.to ||
    pathname.startsWith(`${item.to}/`) ||
    (item.alsoActiveFor ?? []).some((prefix) => pathname.startsWith(prefix))
  );
}
