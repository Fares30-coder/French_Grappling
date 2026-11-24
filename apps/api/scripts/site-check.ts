// Usage: pnpm site:check [distDir]
// Checks a site build (default apps/web/dist) before deployment (ADR 0006 D4): every JSON file
// matches its schema, at least one technique is published, no admin code, API route or source map is in dist/.
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  graphSchema,
  positionListSchema,
  tagListSchema,
  techniqueDetailSchema,
  techniqueListSchema,
} from '@tatamap/shared';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const dist = resolve(REPO_ROOT, process.argv[2] ?? 'apps/web/dist');

const FORBIDDEN = ['/api/admin', '/api/auth', '/admin/login'];

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

async function main(): Promise<void> {
  const data = join(dist, 'data/v1');
  const json = async (name: string) =>
    JSON.parse(await readFile(join(data, name), 'utf8')) as unknown;

  const list = techniqueListSchema.parse(await json('techniques.json'));
  if (list.techniques.length === 0) throw new Error('No published technique in the export');
  positionListSchema.parse(await json('positions.json'));
  graphSchema.parse(await json('graph.json'));
  tagListSchema.parse(await json('tags.json'));
  for (const t of list.techniques)
    techniqueDetailSchema.parse(await json(`techniques/${t.slug}.json`));

  const leaks: string[] = [];
  for await (const file of walk(dist)) {
    if (/\.(woff2?|png|glb|ico)$/.test(file)) continue;
    if (file.endsWith('.map')) leaks.push(file);
    else if (FORBIDDEN.some((s) => readFileSync(file, 'utf8').includes(s))) leaks.push(file);
  }
  if (leaks.length > 0)
    throw new Error(`Admin/API code or source maps found in ${leaks.length} file(s) of dist/`);
  console.log(`Site check passed: ${list.techniques.length} techniques, no admin code in dist/`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
