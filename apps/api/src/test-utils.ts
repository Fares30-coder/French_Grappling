import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
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
