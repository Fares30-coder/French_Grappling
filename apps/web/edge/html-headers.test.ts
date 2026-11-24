import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  generateNonce,
  htmlHeaders,
  injectNonce,
  MINIMAL_CSP,
  NONCE_PLACEHOLDER,
} from './html-headers';

describe('nonce', () => {
  it('is 16 random bytes in base64, different each time', () => {
    const a = generateNonce();
    expect(atob(a)).toHaveLength(16);
    expect(generateNonce()).not.toBe(a);
  });

  it('replaces every placeholder', () => {
    const html = `<script nonce="${NONCE_PLACEHOLDER}"></script><link nonce="${NONCE_PLACEHOLDER}">`;
    expect(injectNonce(html, 'abc=')).toBe('<script nonce="abc="></script><link nonce="abc=">');
  });
});

describe('contentSecurityPolicy', () => {
  it('adsense profile carries the nonce and strict-dynamic', () => {
    const csp = contentSecurityPolicy('adsense', 'N0nce=');
    expect(csp).toContain("script-src 'nonce-N0nce=' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('strict profile has no nonce and no https: wildcard', () => {
    const csp = contentSecurityPolicy('strict', 'N0nce=');
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain('N0nce=');
    expect(csp).not.toContain('https:');
  });
});

describe('htmlHeaders', () => {
  const base = { profile: 'adsense', nonce: 'n' } as const;

  it('enforces or only reports', () => {
    expect(Object.keys(htmlHeaders({ ...base, reportOnly: false }))).toContain(
      'Content-Security-Policy',
    );
    const report = htmlHeaders({ ...base, reportOnly: true });
    expect(report['Content-Security-Policy']).toBe(MINIMAL_CSP);
    expect(report['X-Frame-Options']).toBe('DENY');
    expect(report['Reporting-Endpoints']).toBe('csp="/csp-report"');
    expect(report['Content-Security-Policy-Report-Only']).toContain(
      'report-to csp; report-uri /csp-report',
    );
    expect(report['Content-Security-Policy-Report-Only']).toBeDefined();
  });

  it('sets the other security headers and revalidates the page', () => {
    const h = htmlHeaders({ ...base, reportOnly: false });
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(h['Cache-Control']).toBe('no-cache');
  });
});
