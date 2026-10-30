import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiProxy = { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000' };

/**
 * Public API reads the service worker may cache (GET only). Never /api/admin/* nor /api/auth/*
 * (ADR 0003): admin data and sessions stay network-only.
 */
const isPublicApiRead = ({ url, request }: { url: URL; request: Request }) =>
  request.method === 'GET' &&
  url.pathname.startsWith('/api/') &&
  !url.pathname.startsWith('/api/admin') &&
  !url.pathname.startsWith('/api/auth');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Offline at the club (phase 3, lot 7). Production build only (not in `vite` dev).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tatamap',
        short_name: 'Tatamap',
        description:
          'Le jiu-jitsu en 3D et en français : techniques animées et carte des positions.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0f1a1f',
        theme_color: '#0f1a1f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The whole app is precached: code (3D chunk included), styles, fonts, icons.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Fresh when online; the last copy when offline or slow.
            urlPattern: isPublicApiRead,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tatamap-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // The 3D chunk (three.js, ~940 kB) is lazy-loaded by the pages that show 3D; the entry
    // stays ~250 kB. Warn only above that known size.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Same-origin calls to the API in dev: no CORS needed in phase 1.
    proxy: apiProxy,
  },
  // `vite preview` serves the production build (service worker included) with the same proxy.
  preview: { proxy: apiProxy },
});
