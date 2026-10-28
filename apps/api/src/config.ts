/** Runtime configuration handed to `buildApp` (derived from the environment by `toAppConfig`). */
export type AppConfig = {
  jwtSecret: string;
  /** Allowed `Origin` values for unsafe requests, normalised (scheme://host[:port]). */
  webOrigins: ReadonlyArray<string>;
  cookieSecure: boolean;
  cookieName: string;
  /** Number of trusted proxy hops; 0 = none. */
  trustProxy: number;
  logLevel: string;
};
