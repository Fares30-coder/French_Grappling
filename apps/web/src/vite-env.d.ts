/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL. Empty (default) = same origin: Vite proxy in dev, host rewrite in prod. Never put a secret in a VITE_* variable. */
  readonly VITE_API_URL?: string;
}
