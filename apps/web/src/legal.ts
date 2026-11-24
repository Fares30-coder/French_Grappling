/**
 * Publisher identity for the legal notice (LCEN art. 6) and the privacy policy.
 * Values come from build-time variables (VITE_LEGAL_*, GitHub Actions variables) so that no personal
 * data lives in this public repo. Unset = `null`: the pages then show a visible "À COMPLÉTER" mark,
 * and `missingLegalFields()` tells the CI/Fares what is left to fill before launch.
 */
function read(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const LEGAL = {
  name: read(import.meta.env.VITE_LEGAL_NAME),
  status: read(import.meta.env.VITE_LEGAL_STATUS),
  siret: read(import.meta.env.VITE_LEGAL_SIRET),
  address: read(import.meta.env.VITE_LEGAL_ADDRESS),
  email: read(import.meta.env.VITE_LEGAL_EMAIL),
  director: read(import.meta.env.VITE_LEGAL_DIRECTOR),
} as const;

/** The host is fixed by ADR 0006 (Cloudflare); its identity is public information (cloudflare.com/privacypolicy). */
export const HOST = {
  name: 'Cloudflare, Inc.',
  address: '101 Townsend St., San Francisco, CA 94107, États-Unis',
  website: 'https://www.cloudflare.com',
} as const;

export type LegalField = keyof typeof LEGAL;

export function missingLegalFields(legal: Record<LegalField, string | null> = LEGAL): LegalField[] {
  return (Object.keys(legal) as LegalField[]).filter((k) => legal[k] === null);
}
