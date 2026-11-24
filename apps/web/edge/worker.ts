// Cloudflare Worker (ADR 0006 D5): runs only for HTML navigations (wrangler.jsonc run_worker_first
// excludes the static files). Reads the page from the assets, gives it a per-response nonce, sets
// the CSP and the other security headers.
import { handleCspReport } from './csp-report';
import {
  CSP_REPORT_PATH,
  type CspProfile,
  generateNonce,
  htmlHeaders,
  injectNonce,
} from './html-headers';

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** 'adsense' or 'strict' (no ads); anything else falls back to strict. */
  CSP_PROFILE?: string;
  /** Only exactly 'true' reports without enforcing; anything else enforces (fail closed). */
  CSP_REPORT_ONLY?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === CSP_REPORT_PATH) return handleCspReport(request);
    let asset = await env.ASSETS.fetch(request);
    // SPA fallback done here, not by the assets layer (not_found_handling: "none"): the Worker only
    // sees navigations, so a missing /assets, /data or /models file stays a real 404 instead of
    // index.html (cached as immutable under /assets). Client routes are resolved by the app.
    if (asset.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
      asset = await env.ASSETS.fetch(new Request(new URL('/', url), request));
    }
    if (!asset.headers.get('Content-Type')?.includes('text/html')) return asset;

    const nonce = generateNonce();
    const headers = new Headers(
      htmlHeaders({
        nonce,
        profile: (env.CSP_PROFILE === 'adsense' ? 'adsense' : 'strict') satisfies CspProfile,
        reportOnly: env.CSP_REPORT_ONLY === 'true',
      }),
    );
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(injectNonce(await asset.text(), nonce), { status: asset.status, headers });
  },
};
