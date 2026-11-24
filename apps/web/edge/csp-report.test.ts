import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCspReport, MAX_REPORT_BYTES, parseReports } from './csp-report';

const post = (body: string, type = 'application/reports+json') =>
  new Request('https://x.test/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': type },
    body,
  });

afterEach(() => vi.restoreAllMocks());

describe('parseReports', () => {
  it('reduces a Reporting API report and drops query strings', () => {
    const raw = JSON.stringify([
      {
        type: 'csp-violation',
        body: {
          effectiveDirective: 'script-src-elem',
          blockedURL: 'https://evil.test/a.js?token=1',
          documentURL: 'https://x.test/techniques/a?q=secret#h',
          sample: 'secret code',
        },
      },
    ]);
    expect(parseReports(raw)).toEqual([
      {
        directive: 'script-src-elem',
        blocked: 'https://evil.test/a.js',
        document: 'https://x.test/techniques/a',
      },
    ]);
  });

  it('reads the legacy report-uri format', () => {
    const raw = JSON.stringify({
      'csp-report': {
        'violated-directive': 'img-src',
        'blocked-uri': 'inline',
        'document-uri': 'https://x.test/?a=b',
      },
    });
    expect(parseReports(raw)).toEqual([
      { directive: 'img-src', blocked: 'inline', document: 'https://x.test/' },
    ]);
  });

  it('ignores garbage', () => {
    expect(parseReports('nope')).toEqual([]);
    expect(parseReports('[1,{"body":{}}]')).toEqual([]);
  });
});

describe('handleCspReport', () => {
  it('answers 204 and logs the reduced report', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await handleCspReport(
      post(
        '{"csp-report":{"violated-directive":"img-src","blocked-uri":"https://a.test/x?y=1"}}',
        'application/csp-report',
      ),
    );
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).not.toContain('y=1');
  });

  it('rejects big bodies, wrong types and wrong methods', async () => {
    expect((await handleCspReport(post('x'.repeat(MAX_REPORT_BYTES + 1)))).status).toBe(413);
    expect((await handleCspReport(post('{}', 'text/plain'))).status).toBe(415);
    expect((await handleCspReport(new Request('https://x.test/csp-report'))).status).toBe(405);
  });
});
