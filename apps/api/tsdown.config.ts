import { defineConfig } from 'tsdown';

export default defineConfig({
  // Named entries: dist/server.js and dist/create-admin.js (run in production with `node dist/create-admin.js`).
  entry: { server: 'src/server.ts', 'create-admin': 'scripts/create-admin.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  // Bundle the TS-only workspace package; real dependencies stay external.
  deps: { alwaysBundle: ['@tatamap/shared'] },
  fixedExtension: false,
});
