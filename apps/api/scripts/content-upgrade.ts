// Usage: pnpm content:upgrade
// Rewrites the technique files of CONTENT_DIR (default: content/ at the repo root) whose poses
// are in an older skeleton, in the current one (ADR 0002 D6, ADR 0004). No database. Safe to run
// twice; if one file is invalid nothing is written. Then: pnpm content:import.
import { fileURLToPath } from 'node:url';
import { resolveContentDir } from '../src/content/content-dir';
import { upgradeContentFiles } from '../src/migration/pose-upgrade';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

async function main(): Promise<void> {
  const dir = resolveContentDir(process.env, REPO_ROOT);
  const { files, steps } = await upgradeContentFiles(dir);
  console.log(`Upgraded ${steps} steps in ${files.length} files of ${dir}`);
  for (const name of files) console.log(`  ${name}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
