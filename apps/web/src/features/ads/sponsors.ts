/** A sponsor sold directly (no ad network): an image and a link, no tracking cookie. */
export interface Sponsor {
  id: string;
  name: string;
  /** Under `public/sponsors/`, 300×600 (or 300×250). */
  image: string;
  /** Add UTM parameters so the sponsor sees the visits in their own analytics. */
  href: string;
  alt: string;
  /** First day shown, `YYYY-MM-DD`. */
  from: string;
  /** Last day shown (included), `YYYY-MM-DD`. */
  until: string;
}

/** Sponsors currently booked. Empty: the slot falls back to AdSense, then to "become a sponsor". */
export const SPONSORS: readonly Sponsor[] = [];

/** Sponsors whose campaign covers `now` (UTC day). */
export function activeSponsors(list: readonly Sponsor[], now = new Date()): Sponsor[] {
  const today = now.toISOString().slice(0, 10);
  return list.filter((s) => s.from <= today && today <= s.until);
}
