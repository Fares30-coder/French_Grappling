import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  // Bundle the TS-only workspace package; real dependencies stay external.
  deps: { alwaysBundle: ['@tatamap/shared'] },
  fixedExtension: false,
});
