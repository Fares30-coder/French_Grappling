import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { hashPassword } from './auth/password';
import type { AppConfig } from './config';
import type { PrismaClient } from './generated/prisma/client';

/** Origin accepted by the test configuration; send it on every unsafe request. */
export const ORIGIN = 'http://localhost:5173';

/** Non-secret test configuration (the secret is 48 bytes, like a real one). */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    jwtSecret: 'test-only-secret-not-used-anywhere-else-0123456789ab',
    webOrigins: [ORIGIN],
    cookieSecure: true,
    cookieName: '__Host-tatamap_session',
    trustProxy: 0,
    logLevel: 'silent',
    ...overrides,
  };
}

export function buildTestApp(
  prisma: PrismaClient,
  overrides: Partial<AppConfig> = {},
  logStream?: NodeJS.WritableStream,
): Promise<FastifyInstance> {
  return buildApp({ prisma, config: testConfig(overrides), ...(logStream ? { logStream } : {}) });
}

/** Unique slug per call: Vitest runs test files in parallel on the same database. */
export const uniqueSlug = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8)}`.toLowerCase();

export const TEST_ADMIN_PASSWORD = 'test-password-1234';

/** Creates an admin with a unique email. Delete it with `prisma.admin.delete` in afterAll. */
export async function createTestAdmin(
  prisma: PrismaClient,
  password: string = TEST_ADMIN_PASSWORD,
): Promise<{ id: string; email: string; password: string }> {
  const email = `${uniqueSlug('admin')}@example.test`;
  const admin = await prisma.admin.create({
    data: { email, passwordHash: await hashPassword(password) },
  });
  return { id: admin.id, email, password };
}

/** Value of the named cookie in a `set-cookie` header (or undefined). */
export function cookieValue(
  setCookie: string | string[] | undefined,
  name: string,
): string | undefined {
  const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = lines.find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).split(';')[0];
}

/** Logs in through the real route and returns the `Cookie` header to send on later requests. */
export async function login(
  app: FastifyInstance,
  credentials: { email: string; password: string },
  cookieName = testConfig().cookieName,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: ORIGIN },
    payload: credentials,
  });
  const value = cookieValue(res.headers['set-cookie'], cookieName);
  if (res.statusCode !== 200 || !value) throw new Error(`test login failed (${res.statusCode})`);
  return `${cookieName}=${value}`;
}

/** Session cookie signed directly (no login request, so no rate-limit budget used). */
export function sessionCookie(
  app: FastifyInstance,
  adminId: string,
  expiresIn = '2h',
  cookieName = testConfig().cookieName,
): string {
  return `${cookieName}=${app.jwt.sign({ sub: adminId }, { expiresIn })}`;
}
