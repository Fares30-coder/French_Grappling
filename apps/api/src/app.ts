import fastifyHelmet from '@fastify/helmet';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { registerOriginCheck } from './auth/origin-check';
import type { AppConfig } from './config';
import { registerErrorHandlers } from './errors';
import type { PrismaClient } from './generated/prisma/client';
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
  registerHealthRoutes(app);
  registerTechniqueRoutes(app, prisma);
  return app;
}
