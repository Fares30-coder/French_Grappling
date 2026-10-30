import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The 3D chunk (three.js, ~940 kB) is lazy-loaded by the pages that show 3D; the entry
    // stays ~250 kB. Warn only above that known size.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Same-origin calls to the API in dev: no CORS needed in phase 1.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000' },
  },
});
