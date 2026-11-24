/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL. Empty (default) = same origin: Vite proxy in dev, host rewrite in prod. Never put a secret in a VITE_* variable. */
  readonly VITE_API_URL?: string;
  /** 'static' = public data read from /data/v1/*.json (deployed site, ADR 0006); unset = /api (local dev). */
  readonly VITE_DATA_SOURCE?: 'static' | 'api';
  /** AdSense publisher id (`ca-pub-…`). Unset = no AdSense (the rail shows sponsors or "become a sponsor"). */
  readonly VITE_ADSENSE_CLIENT?: string;
  /** AdSense ad unit id of the right-hand rail. */
  readonly VITE_ADSENSE_SLOT_RAIL?: string;
  readonly VITE_ADSENSE_SLOT_INLINE?: string;
  /** Publisher identity of the legal notice (LCEN). Public by law, but kept out of this public repo: set at build time. Unset = shown as "to fill in". */
  readonly VITE_LEGAL_NAME?: string;
  readonly VITE_LEGAL_STATUS?: string;
  readonly VITE_LEGAL_SIRET?: string;
  readonly VITE_LEGAL_ADDRESS?: string;
  readonly VITE_LEGAL_EMAIL?: string;
  readonly VITE_LEGAL_DIRECTOR?: string;
}
