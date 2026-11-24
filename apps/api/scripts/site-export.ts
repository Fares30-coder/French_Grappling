// Usage: pnpm site:export [outDir]
// Writes the published content from the database (DATABASE_URL) as static JSON files, by default
// into apps/web/dist/data/v1 (run it after the web build, which empties dist/). ADR 0006 D2.
import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrisma } from '../src/db';
import { exportSite } from '../src/site/site-export';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

async function main(): Promise<void> {
  const outDir = resolve(REPO_ROOT, process.argv[2] ?? 'apps/web/dist/data/v1');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = createPrisma(databaseUrl);
  try {
    const result = await exportSite(prisma, outDir);
    // Counters only: the CI logs must not carry content.
    console.log(
      `Exported ${result.techniques} techniques, ${result.positions} positions, ${result.tags} tags to ${outDir}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
