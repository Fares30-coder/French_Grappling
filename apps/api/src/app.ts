import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandlers } from './errors';
import type { PrismaClient } from './generated/prisma/client';
import { registerHealthRoutes } from './routes/health';

export type AppDeps = {
  prisma: PrismaClient;
  logLevel?: string;
};

export function buildApp({ prisma: _prisma, logLevel = 'silent' }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { level: logLevel } });
  registerErrorHandlers(app);
  registerHealthRoutes(app);
  return app;
}
