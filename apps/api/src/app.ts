import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { adminPlugin } from './auth/admin-plugin';
import { registerOriginCheck } from './auth/origin-check';
import { warmUpPasswordHashing } from './auth/password';
import type { AppConfig } from './config';
import { registerErrorHandlers } from './errors';
import type { PrismaClient } from './generated/prisma/client';
import { registerAuthRoutes } from './routes/auth';
import { registerHealthRoutes } from './routes/health';
import { registerTechniqueRoutes } from './routes/techniques';

export type AppDeps = {
  prisma: PrismaClient;
  config: AppConfig;
  /** Tests only: capture the logs in memory. */
  logStream?: NodeJS.WritableStream;
};

/** A full technique (40 steps) weighs about 50 KiB. */
const BODY_LIMIT_BYTES = 256 * 1024;

export async function buildApp({ prisma, config, logStream }: AppDeps): Promise<FastifyInstance> {
  const options: FastifyServerOptions = {
    bodyLimit: BODY_LIMIT_BYTES,
    // N trusted hops (proxy-addr semantics of a numeric trustProxy); false = use the socket address.
    trustProxy: config.trustProxy > 0 ? (_address, hop) => hop < config.trustProxy : false,
    logger: {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      ...(logStream ? { stream: logStream } : {}),
    },
  };
  const app = Fastify(options);
  registerErrorHandlers(app);
  // The API only serves JSON: lock everything down. The front's CSP is set by its host (phase 3).
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  registerOriginCheck(app, config.webOrigins);

  await app.register(fastifyCookie);
  // expiresIn is a string on purpose: a number would be read as milliseconds by fast-jwt.
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { algorithm: 'HS256', expiresIn: '2h', iss: 'tatamap-api', aud: 'tatamap-admin' },
    verify: { algorithms: ['HS256'], allowedIss: 'tatamap-api', allowedAud: 'tatamap-admin' },
    cookie: { cookieName: config.cookieName, signed: false },
  });
  // Not global: only the routes that opt in (login) are limited. In-memory store (single process).
  await app.register(fastifyRateLimit, { global: false });
  await warmUpPasswordHashing();

  registerAuthRoutes(app, { prisma, config });
  await app.register(adminPlugin, { prefix: '/api/admin', prisma, config });
  registerHealthRoutes(app);
  registerTechniqueRoutes(app, prisma);
  return app;
}
