import 'dotenv/config';
import { buildApp } from './app';
import { createPrisma } from './db';
import { loadEnv, toAppConfig } from './env';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
const app = await buildApp({ prisma, config: toAppConfig(env) });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  await prisma.$disconnect();
  process.exit(1);
}
