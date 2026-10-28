// Usage: pnpm content:import
// Loads CONTENT_DIR (default: content/ at the repo root, a clone of the private repo
// tatamap-content) into the database (DATABASE_URL): upsert by slug, safe to run twice.
// All files are validated first; if one is invalid nothing is written.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolveContentDir } from '../src/content/content-dir';
import { importContent } from '../src/content/content-io';
import { createPrisma } from '../src/db';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

async function main(): Promise<void> {
  const dir = resolveContentDir(process.env, REPO_ROOT);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = createPrisma(databaseUrl);
  try {
    const result = await importContent(prisma, dir);
    console.log(
      `Imported ${result.techniques} techniques, ${result.positions} positions, ${result.tags} tags from ${dir}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
