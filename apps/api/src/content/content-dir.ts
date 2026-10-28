import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export class ContentDirError extends Error {}

/**
 * Where the content files live: `CONTENT_DIR` (absolute, or relative to the repo root), default
 * `content/` at the repo root. The directory must already exist: it is a clone of the private repo
 * Fares30-coder/tatamap-content, which these scripts never create.
 */
export function resolveContentDir(env: NodeJS.ProcessEnv, repoRoot: string): string {
  const dir = resolve(repoRoot, env.CONTENT_DIR?.trim() || 'content');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new ContentDirError(
      `Content directory not found: ${dir}\n` +
        'Clone the private content repository into it:\n' +
        '  git clone git@github.com:Fares30-coder/tatamap-content.git content\n' +
        '(or set CONTENT_DIR to another folder).',
    );
  }
  return dir;
}
