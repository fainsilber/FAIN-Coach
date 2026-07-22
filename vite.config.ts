/// <reference types="vitest/config" />
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from a GitHub Pages project subpath in production
// (https://fainsilber.github.io/FAIN-Coach/); root in dev.
export default defineConfig(({ command, isPreview }) => {
  // Subpath for the deployed build and for `vite preview` (which faithfully
  // serves the built artifact); root only for the `vite dev` workflow.
  const base = command === 'build' || isPreview ? '/FAIN-Coach/' : '/';
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // scope/start_url must match the deploy base so the installed PWA
        // and the service worker are scoped to the subpath.
        scope: base,
        manifest: {
          name: 'FAIN Coach',
          short_name: 'FAIN Coach',
          description:
            'Local-first AI running coach. Upload TCX files, get coaching feedback via OpenRouter.',
          theme_color: '#0a0a0a',
          background_color: '#0a0a0a',
          display: 'standalone',
          scope: base,
          start_url: base,
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
