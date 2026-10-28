// Usage: pnpm content:export
// Writes positions.json, tags.json and techniques/<slug>.json from the database (DATABASE_URL) into
// CONTENT_DIR (default: content/ at the repo root, a clone of the private repo tatamap-content).
// Commit and push from there: git -C content add -A && git -C content commit && git -C content push
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolveContentDir } from '../src/content/content-dir';
import { exportContent } from '../src/content/content-io';
import { createPrisma } from '../src/db';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

async function main(): Promise<void> {
  const dir = resolveContentDir(process.env, REPO_ROOT);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = createPrisma(databaseUrl);
  try {
    const result = await exportContent(prisma, dir);
    console.log(
      `Exported ${result.techniques} techniques, ${result.positions} positions, ${result.tags} tags to ${dir}`,
    );
    for (const name of result.removed)
      console.log(`Removed techniques/${name} (no longer in the database)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
