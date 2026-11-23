/**
 * Google AdSense. Off until VITE_ADSENSE_CLIENT and VITE_ADSENSE_SLOT_RAIL are set.
 * Consent (GDPR) is handled by Google's certified CMP, enabled in the AdSense dashboard
 * ("Privacy & messaging" > "European regulations"): it is served by the same script.
 */
export const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;
export const ADSENSE_SLOT_RAIL = import.meta.env.VITE_ADSENSE_SLOT_RAIL;

import { isAdminPath } from '../../lib/admin-isolation';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let scriptAdded = false;

/** Adds the AdSense script once, on the first ad shown (never on admin pages). */
export function loadAdSense(client: string): void {
  if (scriptAdded || isAdminPath(window.location.pathname)) return;
  scriptAdded = true;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(script);
}

/** Asks AdSense to fill the `<ins>` just mounted. */
export function requestAd(): void {
  try {
    window.adsbygoogle = window.adsbygoogle ?? [];
    window.adsbygoogle.push({});
  } catch {
    // Blocked by an ad blocker or slot already filled: the rail just stays empty.
  }
}
