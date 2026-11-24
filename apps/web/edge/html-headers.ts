/** Pure helpers of the Cloudflare Worker (ADR 0006 D5): nonce, CSP, security headers. */

/** Fixed value Vite writes in every `nonce` attribute (vite.config.ts, html.cspNonce). */
export const NONCE_PLACEHOLDER = '__CSP_NONCE__';

/** 16 random bytes, base64: the per-response nonce. */
export function generateNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/** Gives the page its own nonce: replaces every placeholder of the build. */
export function injectNonce(html: string, nonce: string): string {
  return html.replaceAll(NONCE_PLACEHOLDER, nonce);
}

export type CspProfile = 'strict' | 'adsense';

/**
 * `adsense`: the strict nonce-based CSP Google supports; 'strict-dynamic' lets our scripts load the
 * AdSense script and the lazy chunks, https: and 'unsafe-inline' are fallbacks ignored where
 * 'strict-dynamic' works. `strict`: no ads, everything from our own origin (blob: for textures).
 */
export function contentSecurityPolicy(profile: CspProfile, nonce: string): string {
  if (profile === 'adsense') {
    return `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
  }
  return "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
}

export type HtmlHeaderOptions = { profile: CspProfile; reportOnly: boolean; nonce: string };

/** Headers of an HTML page. `_headers` does not apply to Worker responses: they are all set here. */
export function htmlHeaders({
  profile,
  reportOnly,
  nonce,
}: HtmlHeaderOptions): Record<string, string> {
  const csp = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  return {
    [csp]: contentSecurityPolicy(profile, nonce),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cache-Control': 'no-cache',
  };
}
