import { describe, expect, it } from 'vitest';
import worker from './worker';

const INDEX = '<!doctype html><script nonce="__CSP_NONCE__"></script>';

/** Fake assets binding: serves `/` (index.html) and one technique JSON, like `not_found_handling: "none"`. */
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
          if (path === '/')
            return new Response(INDEX, { headers: { 'Content-Type': 'text/html' } });
          if (path === '/data/v1/techniques/ciseau.json')
            return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
          return new Response('not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          });
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
    expect(seen).toEqual(['/techniques/ciseau', '/', '/data/v1/techniques/ciseau.json']);
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

  it.each(['/', '/carte', '/bibliotheque/', '/mentions-legales', '/confidentialite'])(
    'answers 200 for the public page %s',
    async (path) => {
      const res = await worker.fetch(new Request(`https://tatamap.fr${path}`), env().env);
      expect(res.status).toBe(200);
    },
  );

  it.each(['/.git/config', '/admin', '/techniques/inconnue', '/techniques/../data', '/carte/x'])(
    'answers 404 with the app page for %s',
    async (path) => {
      const res = await worker.fetch(new Request(`https://tatamap.fr${path}`), env().env);
      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toContain('text/html');
      expect(await res.text()).toContain('<!doctype html>');
    },
  );
});
