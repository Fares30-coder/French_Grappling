/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL. Empty (default) = same origin: Vite proxy in dev, host rewrite in prod. Never put a secret in a VITE_* variable. */
  readonly VITE_API_URL?: string;
  /** AdSense publisher id (`ca-pub-…`). Unset = no AdSense (the rail shows sponsors or "become a sponsor"). */
  readonly VITE_ADSENSE_CLIENT?: string;
  /** AdSense ad unit id of the right-hand rail. */
  readonly VITE_ADSENSE_SLOT_RAIL?: string;
}
