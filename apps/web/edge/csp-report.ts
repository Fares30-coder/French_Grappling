/** CSP violation reports (ADR 0006 D5): size limit, parsing, reduced log line without query strings. */

export const MAX_REPORT_BYTES = 8 * 1024;

export type ReducedReport = { directive: string; blocked: string; document: string };

/** Origin + path only: query strings and fragments can carry personal data. */
function stripQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return (value.split(/[?#]/)[0] ?? '').slice(0, 200);
}

function reduce(body: unknown): ReducedReport | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const directive = b.effectiveDirective ?? b['effective-directive'] ?? b['violated-directive'];
  if (typeof directive !== 'string') return null;
  return {
    directive: directive.slice(0, 60),
    blocked: stripQuery(b.blockedURL ?? b['blocked-uri']),
    document: stripQuery(b.documentURL ?? b['document-uri']),
  };
}

/** Handles `application/reports+json` (array of reports) and `application/csp-report` (one object). */
export function parseReports(raw: string): ReducedReport[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(json) ? json : [json];
  return items
    .slice(0, 10)
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const r = item as Record<string, unknown>;
      return reduce(r['csp-report'] ?? r.body);
    })
    .filter((r): r is ReducedReport => r !== null);
}

/** Reads at most MAX_REPORT_BYTES; null when the body is larger. */
async function readLimited(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > MAX_REPORT_BYTES) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REPORT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.reduce((all, c) => {
      const merged = new Uint8Array(all.length + c.length);
      merged.set(all);
      merged.set(c, all.length);
      return merged;
    }, new Uint8Array()),
  );
}

const TYPES = ['application/reports+json', 'application/csp-report', 'application/json'];

export async function handleCspReport(request: Request): Promise<Response> {
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const type =
    (request.headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!TYPES.includes(type)) return new Response(null, { status: 415 });
  const raw = await readLimited(request);
  if (raw === null) return new Response(null, { status: 413 });
  for (const report of parseReports(raw)) console.log(JSON.stringify({ csp: report }));
  return new Response(null, { status: 204 });
}
