import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestError, apiRequest, apiSend } from './api';

type FetchCall = { url: string; init: RequestInit };

/** Replaces fetch with a stub returning `response` and records the calls. */
function stubFetch(response: Response | Error): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  });
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const schema = z.object({ ok: z.boolean() });
const headersOf = (call: FetchCall | undefined) =>
  (call?.init.headers ?? {}) as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('apiRequest / apiSend', () => {
  it('GET sends no Content-Type and no body', async () => {
    const calls = stubFetch(json({ ok: true }));
    await expect(apiRequest('/api/x', schema)).resolves.toEqual({ ok: true });
    expect(calls[0]?.init.method).toBe('GET');
    expect(headersOf(calls[0])['Content-Type']).toBeUndefined();
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('POST with a body sends JSON and its Content-Type', async () => {
    const calls = stubFetch(json({ ok: true }));
    await apiRequest('/api/x', schema, { method: 'POST', body: { a: 1 } });
    expect(headersOf(calls[0])['Content-Type']).toBe('application/json');
    expect(calls[0]?.init.body).toBe('{"a":1}');
  });

  it('POST without body sends neither header nor body', async () => {
    const calls = stubFetch(new Response(null, { status: 204 }));
    await apiSend('/api/x/duplicate', { method: 'POST' });
    expect(headersOf(calls[0])['Content-Type']).toBeUndefined();
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it('always sends credentials', async () => {
    const calls = stubFetch(json({ ok: true }));
    await apiRequest('/api/x', schema);
    expect(calls[0]?.init.credentials).toBe('include');
  });

  it('prefixes VITE_API_URL (trailing slashes removed)', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test//');
    const calls = stubFetch(json({ ok: true }));
    await apiRequest('/api/x', schema);
    expect(calls[0]?.url).toBe('https://api.example.test/api/x');
  });

  it('uses a relative URL when VITE_API_URL is empty', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const calls = stubFetch(json({ ok: true }));
    await apiRequest('/api/x', schema);
    expect(calls[0]?.url).toBe('/api/x');
  });

  it('204 resolves to undefined', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiSend('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('exposes the reason of a 409 error', async () => {
    stubFetch(
      json({ error: { code: 'conflict', message: 'stale', reason: 'version_mismatch' } }, 409),
    );
    const error = await apiRequest('/api/x', schema, { method: 'PUT', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 409, code: 'conflict', reason: 'version_mismatch' });
  });

  it('reports a network failure with code "network"', async () => {
    stubFetch(new TypeError('offline'));
    const error = await apiRequest('/api/x', schema).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: 'network' });
  });

  it('rejects a response that does not match the schema', async () => {
    stubFetch(json({ nope: 1 }));
    const error = await apiRequest('/api/x', schema).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'invalid_response' });
  });
});
