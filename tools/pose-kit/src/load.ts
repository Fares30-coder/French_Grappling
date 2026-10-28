import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type ContentTechnique, contentTechniqueSchema, slugSchema } from '@tatamap/shared';

/** Repo root, whatever the directory pnpm runs the script from. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
/** Where the user typed the command (pnpm sets INIT_CWD when it runs a script in another package). */
const userCwd = (): string => process.env.INIT_CWD ?? process.cwd();

/** CONTENT_DIR (default `content/` at the repo root; relative paths are relative to the user's cwd). */
export function contentDir(): string {
  const dir = process.env.CONTENT_DIR;
  return dir ? path.resolve(userCwd(), dir) : path.join(REPO_ROOT, 'content');
}

/**
 * `<slug>` -> `<CONTENT_DIR>/techniques/<slug>.json`; anything that looks like a path
 * (contains a slash or ends in .json) is taken as is. A slug must match slugSchema, so it can
 * never escape the techniques folder.
 */
export function resolveTechniqueFile(arg: string): string {
  if (arg.includes('/') || arg.endsWith('.json')) return path.resolve(userCwd(), arg);
  const slug = slugSchema.safeParse(arg);
  if (!slug.success) throw new Error(`"${arg}" is neither a valid slug nor a .json path`);
  return path.join(contentDir(), 'techniques', `${slug.data}.json`);
}

export type LoadResult =
  | { ok: true; file: string; technique: ContentTechnique }
  | { ok: false; file: string; errors: string[] };

/** Reads and validates one technique file with contentTechniqueSchema (what `content:import` uses). */
export function loadTechnique(file: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { ok: false, file, errors: [`cannot read ${file}: ${(error as Error).message}`] };
  }
  const parsed = contentTechniqueSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      file,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, file, technique: parsed.data };
}
