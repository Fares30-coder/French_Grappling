import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const apiProxy = { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000' };

/** Emits `ads.txt` (required by AdSense) when VITE_ADSENSE_CLIENT is set at build time. */
function adsTxt(): Plugin {
  let client: string | undefined;
  return {
    name: 'tatamap-ads-txt',
    apply: 'build',
    configResolved(config) {
      client = config.env.VITE_ADSENSE_CLIENT;
    },
    generateBundle() {
      if (!client) return;
      const publisher = client.replace(/^ca-/, '');
      this.emitFile({
        type: 'asset',
        fileName: 'ads.txt',
        source: `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`,
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), adsTxt()],
  // Build only: every generated <script>/<link> carries this fixed value in its nonce attribute; the
  // Cloudflare Worker (edge/worker.ts) replaces it with a fresh nonce per response (ADR 0006 D5).
  html: command === 'build' ? { cspNonce: '__CSP_NONCE__' } : {},
  build: {
    // Small assets (the woff2 subsets) stay files: a data: font would need `data:` in font-src.
    assetsInlineLimit: 0,
    // The 3D chunk (three.js, ~940 kB) is lazy-loaded by the pages that show 3D; the entry
    // stays ~250 kB. Warn only above that known size.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Same-origin calls to the API in dev: no CORS needed in phase 1.
    proxy: apiProxy,
  },
  // `vite preview` serves the production build with the same proxy.
  preview: { proxy: apiProxy },
}));
