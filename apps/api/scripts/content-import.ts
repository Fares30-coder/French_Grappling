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

/** Name, code and Zod issue paths only: messages can quote private content. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  const { code, issues } = error as { code?: unknown; issues?: { path?: unknown[] }[] };
  const paths = Array.isArray(issues) ? issues.map((i) => (i.path ?? []).join('.')) : [];
  return [error.name, typeof code === 'string' ? code : '', ...paths.slice(0, 20)]
    .filter(Boolean)
    .join(' ');
}

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
  console.error(describeError(error));
  process.exitCode = 1;
});
