import { describe, expect, it } from 'vitest';
import worker from './worker';

const INDEX = '<!doctype html><script nonce="__CSP_NONCE__"></script>';

/** Fake assets binding: serves `/` (index.html) and nothing else, like `not_found_handling: "none"`. */
function env() {
  const seen: string[] = [];
  return {
    seen,
    env: {
      CSP_PROFILE: 'adsense',
      CSP_REPORT_ONLY: 'false',
      ASSETS: {
        async fetch(request: Request) {
          const path = new URL(request.url).pathname;
          seen.push(path);
          return path === '/'
            ? new Response(INDEX, { headers: { 'Content-Type': 'text/html' } })
            : new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
        },
      },
    },
  };
}

describe('worker', () => {
  it('serves index.html with a nonce and the CSP for an unknown client route', async () => {
    const { env: e, seen } = env();
    const res = await worker.fetch(new Request('https://tatamap.fr/techniques/ciseau'), e);
    expect(res.status).toBe(200);
    expect(seen).toEqual(['/techniques/ciseau', '/']);
    expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'nonce-");
    const body = await res.text();
    expect(body).not.toContain('__CSP_NONCE__');
  });

  it('does not turn a non-GET request into the page', async () => {
    const { env: e, seen } = env();
    const res = await worker.fetch(new Request('https://tatamap.fr/x', { method: 'POST' }), e);
    expect(res.status).toBe(404);
    expect(seen).toEqual(['/x']);
  });
});
