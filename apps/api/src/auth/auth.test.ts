import { createHmac } from 'node:crypto';
import { Writable } from 'node:stream';
import { adminSessionSchema, apiErrorSchema } from '@tatamap/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../db';
import {
  buildTestApp,
  cookieValue,
  createTestAdmin,
  login,
  ORIGIN,
  sessionCookie,
  testConfig,
} from '../test-utils';

const prisma = createPrisma(process.env.DATABASE_URL ?? '');
const admin = await createTestAdmin(prisma);
const apps: FastifyInstance[] = [];

/** Each test gets its own app: the login rate limit is per app instance. */
async function newApp(overrides: Parameters<typeof buildTestApp>[1] = {}, logStream?: Writable) {
  const app = await buildTestApp(prisma, overrides, logStream);
  apps.push(app);
  return app;
}

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await prisma.admin.deleteMany({ where: { id: admin.id } });
  await prisma.$disconnect();
});

const loginRequest = (
  app: FastifyInstance,
  payload: unknown,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: ORIGIN, ...headers },
    payload: payload as object,
  });

const COOKIE = testConfig().cookieName;
const me = (app: FastifyInstance, cookie?: string) =>
  app.inject({ method: 'GET', url: '/api/admin/me', ...(cookie ? { headers: { cookie } } : {}) });

// ---- Hand-made tokens, to exercise what the library must refuse ----
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function craft(options: {
  alg?: string;
  secret?: string;
  sub?: string;
  expiresInS?: number;
  iss?: string;
  aud?: string;
  sv?: number;
  authTime?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: options.alg ?? 'HS256', typ: 'JWT' });
  const body = b64({
    sub: options.sub ?? admin.id,
    sv: options.sv ?? 0,
    authTime: options.authTime ?? now,
    iat: now,
    exp: now + (options.expiresInS ?? 7200),
    iss: options.iss ?? 'tatamap-api',
    aud: options.aud ?? 'tatamap-admin',
  });
  const data = `${header}.${body}`;
  if (options.alg === 'none') return `${data}.`;
  const hmac = options.alg === 'HS512' ? 'sha512' : 'sha256';
  return `${data}.${createHmac(hmac, options.secret ?? testConfig().jwtSecret)
    .update(data)
    .digest('base64url')}`;
}

/** Token shaped like the ones issued before sessions were revocable (no sv, no authTime). */
function craftLegacy(): string {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: admin.id,
    iat: now,
    exp: now + 7200,
    iss: 'tatamap-api',
    aud: 'tatamap-admin',
  })}`;
  return `${data}.${createHmac('sha256', testConfig().jwtSecret).update(data).digest('base64url')}`;
}

describe('POST /api/auth/login', () => {
  it('logs in and sets a hardened session cookie', async () => {
    const app = await newApp();
    const res = await loginRequest(app, { email: admin.email, password: admin.password });
    expect(res.statusCode).toBe(200);
    expect(adminSessionSchema.parse(res.json())).toEqual({ email: admin.email });
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('__Host-tatamap_session=');
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=7200']) {
      expect(setCookie).toContain(attr);
    }
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('uses a plain cookie name without Secure when cookieSecure is false', async () => {
    const app = await newApp({ cookieSecure: false, cookieName: 'tatamap_session' });
    const res = await loginRequest(app, { email: admin.email, password: admin.password });
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie.startsWith('tatamap_session=')).toBe(true);
    expect(setCookie).not.toContain('Secure');
    expect(setCookie).toContain('HttpOnly');
  });

  it('answers wrong password and unknown email identically', async () => {
    const app = await newApp();
    const wrong = await loginRequest(app, { email: admin.email, password: 'not-the-password' });
    const unknown = await loginRequest(app, { email: 'nobody@example.test', password: 'whatever' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(apiErrorSchema.parse(wrong.json()).error.message).toBe('Invalid credentials');
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('is case-insensitive on the email', async () => {
    const app = await newApp();
    const res = await loginRequest(app, {
      email: admin.email.toUpperCase(),
      password: admin.password,
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a body with an extra field', async () => {
    const app = await newApp();
    const res = await loginRequest(app, {
      email: admin.email,
      password: admin.password,
      role: 'x',
    });
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('bad_request');
  });

  it('refuses a login without a valid Origin', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: admin.email, password: admin.password },
    });
    expect(res.statusCode).toBe(403);
  });

  it('answers 429 rate_limited on the 6th attempt in the window', async () => {
    const app = await newApp();
    for (let i = 0; i < 5; i++) {
      const res = await loginRequest(app, { email: admin.email, password: 'nope-nope-nope' });
      expect(res.statusCode).toBe(401);
    }
    const res = await loginRequest(app, { email: admin.email, password: admin.password });
    expect(res.statusCode).toBe(429);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('rate_limited');
  });

  it('keys the limit on the socket address unless a proxy is trusted', async () => {
    const spoofed = (app: FastifyInstance, i: number) =>
      loginRequest(
        app,
        { email: 'x@example.test', password: 'x' },
        { 'x-forwarded-for': `10.0.0.${i}` },
      );

    const untrusted = await newApp({ trustProxy: 0 });
    let last = 0;
    for (let i = 1; i <= 6; i++) last = (await spoofed(untrusted, i)).statusCode;
    expect(last).toBe(429); // a forged X-Forwarded-For does not reset the counter

    const trusted = await newApp({ trustProxy: 1 });
    for (let i = 1; i <= 6; i++) expect((await spoofed(trusted, i)).statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('answers 204 and clears the cookie', async () => {
    const app = await newApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain(`${COOKIE}=;`);
    expect(setCookie).toContain('Max-Age=0');
  });

  it('revokes the session: the same token is refused afterwards', async () => {
    const own = await createTestAdmin(prisma);
    const app = await newApp();
    const cookie = await login(app, { email: own.email, password: own.password });
    expect((await me(app, cookie)).statusCode).toBe(200);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: ORIGIN, cookie },
    });
    expect(res.statusCode).toBe(204);
    expect((await me(app, cookie)).statusCode).toBe(401);
    const row = await prisma.admin.findUniqueOrThrow({ where: { id: own.id } });
    expect(row.sessionVersion).toBe(1);
    await prisma.admin.delete({ where: { id: own.id } });
  });

  it('does not bump sessionVersion for a request without a valid session', async () => {
    const own = await createTestAdmin(prisma);
    const app = await newApp();
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: ORIGIN, cookie: `${COOKIE}=${craft({ sub: own.id, alg: 'none' })}` },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: ORIGIN, cookie: `${COOKIE}=${craft({ sub: own.id, sv: 7 })}` },
    });
    const row = await prisma.admin.findUniqueOrThrow({ where: { id: own.id } });
    expect(row.sessionVersion).toBe(0);
    await prisma.admin.delete({ where: { id: own.id } });
  });

  it('refuses a logout without Origin', async () => {
    const app = await newApp();
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(403);
  });
});

describe('/api/admin guard', () => {
  it('answers 401 and no-store without a cookie', async () => {
    const app = await newApp();
    const res = await me(app);
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('unauthorized');
  });

  it('answers 200 with a valid cookie', async () => {
    const app = await newApp();
    const res = await me(app, sessionCookie(app, admin.id));
    expect(res.statusCode).toBe(200);
    expect(adminSessionSchema.parse(res.json())).toEqual({ email: admin.email });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('protects unknown admin paths too (401, then 404 when logged in)', async () => {
    const app = await newApp();
    expect((await app.inject({ method: 'GET', url: '/api/admin/whatever' })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/whatever',
      headers: { cookie: sessionCookie(app, admin.id) },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('ignores an Authorization header (cookie only)', async () => {
    const app = await newApp();
    const token = app.jwt.sign({ sub: admin.id });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  const refused: Array<[string, () => string]> = [
    ['signed with HS512', () => craft({ alg: 'HS512' })],
    ['alg none', () => craft({ alg: 'none' })],
    ['expired', () => craft({ expiresInS: -10 })],
    ['signed with another secret', () => craft({ secret: 'another-secret-another-secret-123456' })],
    ['wrong issuer', () => craft({ iss: 'someone-else' })],
    ['wrong audience', () => craft({ aud: 'someone-else' })],
    ['without sv and authTime', () => craftLegacy()],
    ['not a uuid subject', () => craft({ sub: 'admin' })],
    ['garbage', () => 'not.a.jwt'],
  ];
  it.each(refused)('refuses a token %s', async (_label, make) => {
    const app = await newApp();
    const res = await me(app, `${COOKIE}=${make()}`);
    expect(res.statusCode).toBe(401);
  });

  it('accepts a hand-made token that is correct (sanity check of the helper)', async () => {
    const app = await newApp();
    expect((await me(app, `${COOKIE}=${craft({})}`)).statusCode).toBe(200);
  });

  it('refuses the token of a deleted admin', async () => {
    const gone = await createTestAdmin(prisma);
    const app = await newApp();
    const cookie = sessionCookie(app, gone.id);
    expect((await me(app, cookie)).statusCode).toBe(200);
    await prisma.admin.delete({ where: { id: gone.id } });
    expect((await me(app, cookie)).statusCode).toBe(401);
  });

  it('refuses a token issued before a password change (sessionVersion bumped)', async () => {
    const own = await createTestAdmin(prisma);
    const app = await newApp();
    const cookie = sessionCookie(app, own.id);
    expect((await me(app, cookie)).statusCode).toBe(200);
    // Same update as `pnpm admin:create` on an existing admin.
    await prisma.admin.update({
      where: { id: own.id },
      data: { passwordHash: 'x', sessionVersion: { increment: 1 } },
    });
    expect((await me(app, cookie)).statusCode).toBe(401);
    expect((await me(app, sessionCookie(app, own.id, '2h', { sv: 1 }))).statusCode).toBe(200);
    await prisma.admin.delete({ where: { id: own.id } });
  });

  it('refuses a session older than 12 hours since the login, even if the token is fresh', async () => {
    const app = await newApp();
    const now = Math.floor(Date.now() / 1000);
    const fresh = (age: number) => `${COOKIE}=${craft({ authTime: now - age })}`;
    expect((await me(app, fresh(11 * 3600 + 3000))).statusCode).toBe(200);
    expect((await me(app, fresh(12 * 3600 + 60))).statusCode).toBe(401);
  });

  it('keeps authTime when it renews the token', async () => {
    const app = await newApp();
    const authTime = Math.floor(Date.now() / 1000) - 5 * 3600;
    const res = await me(app, sessionCookie(app, admin.id, '50m', { authTime }));
    expect(res.statusCode).toBe(200);
    const renewed = cookieValue(res.headers['set-cookie'], COOKIE) ?? '';
    const payload = JSON.parse(Buffer.from(renewed.split('.')[1] ?? '', 'base64url').toString());
    expect(payload.authTime).toBe(authTime);
    expect(payload.sv).toBe(0);
  });

  it('re-issues the cookie when less than an hour is left', async () => {
    const app = await newApp();
    const res = await me(app, sessionCookie(app, admin.id, '50m'));
    expect(res.statusCode).toBe(200);
    expect(cookieValue(res.headers['set-cookie'], COOKIE)).toBeTruthy();
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=7200');
  });

  it('does not re-issue the cookie when more than an hour is left', async () => {
    const app = await newApp();
    const res = await me(app, sessionCookie(app, admin.id, '90m'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('logs', () => {
  it('never contain the password or the session token', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const app = await newApp({ logLevel: 'trace' }, sink);
    const canary = 'canary-S3cret-pw';
    await loginRequest(app, { email: admin.email, password: canary });
    await loginRequest(app, { email: 'nobody@example.test', password: canary });
    await loginRequest(app, { email: admin.email, password: canary, extra: true });
    const ok = await loginRequest(app, { email: admin.email, password: admin.password });
    const token = cookieValue(ok.headers['set-cookie'], COOKIE) ?? '';
    await me(app, `${COOKIE}=${token}`);

    const logs = lines.join('');
    expect(logs.length).toBeGreaterThan(0); // the capture works
    expect(logs).not.toContain(canary);
    expect(logs).not.toContain(admin.password);
    expect(token.length).toBeGreaterThan(20);
    expect(logs).not.toContain(token);
  });
});
