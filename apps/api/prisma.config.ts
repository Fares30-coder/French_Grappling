import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// PRISMA_TARGET=test points every Prisma CLI command (migrate, seed...) at the test database.
const urlVariable = process.env.PRISMA_TARGET === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url: env(urlVariable) },
});
