import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandlers } from './errors';
import type { PrismaClient } from './generated/prisma/client';
import { registerHealthRoutes } from './routes/health';
import { registerTechniqueRoutes } from './routes/techniques';

export type AppDeps = {
  prisma: PrismaClient;
  logLevel?: string;
};

export function buildApp({ prisma, logLevel = 'silent' }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { level: logLevel } });
  registerErrorHandlers(app);
  registerHealthRoutes(app);
  registerTechniqueRoutes(app, prisma);
  return app;
}
