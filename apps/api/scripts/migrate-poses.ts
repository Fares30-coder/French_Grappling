// Usage: pnpm db:migrate-poses
// Upgrades the poses of the database (DATABASE_URL) that are not in the current skeleton
// (ADR 0002 D6.6): one transaction, safe to run twice.
import 'dotenv/config';
import { createPrisma } from '../src/db';
import { migratePoses } from '../src/migration/pose-upgrade';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = createPrisma(databaseUrl);
  try {
    console.log(`Upgraded ${await migratePoses(prisma)} steps`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
