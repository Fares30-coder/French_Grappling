// Cloudflare Worker (ADR 0006 D5): runs only for HTML navigations (wrangler.jsonc run_worker_first
// excludes the static files). Reads the page from the assets, gives it a per-response nonce, sets
// the CSP and the other security headers.
import { type CspProfile, generateNonce, htmlHeaders, injectNonce } from './html-headers';

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** 'adsense' (default) or 'strict' (no ads). */
  CSP_PROFILE?: string;
  /** 'false' enforces the policy; anything else only reports violations in the browser. */
  CSP_REPORT_ONLY?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const asset = await env.ASSETS.fetch(request);
    if (!asset.headers.get('Content-Type')?.includes('text/html')) return asset;

    const nonce = generateNonce();
    const headers = new Headers(
      htmlHeaders({
        nonce,
        profile: (env.CSP_PROFILE === 'strict' ? 'strict' : 'adsense') satisfies CspProfile,
        reportOnly: env.CSP_REPORT_ONLY !== 'false',
      }),
    );
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(injectNonce(await asset.text(), nonce), { status: asset.status, headers });
  },
};
