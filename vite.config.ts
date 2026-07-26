/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

// Build identity (dev plan §14.2): injected at build time, never
// hand-maintained. Falls back gracefully when git is unavailable (a clean
// tarball, some CI images) rather than failing the build.
function shortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) ?? 'unknown';
  }
}

// Served from a GitHub Pages project subpath in production
// (https://fainsilber.github.io/FAIN-Coach/); root in dev.
export default defineConfig(({ command, isPreview }) => {
  // Subpath for the deployed build and for `vite preview` (which faithfully
  // serves the built artifact); root only for the `vite dev` workflow.
  const base = command === 'build' || isPreview ? '/FAIN-Coach/' : '/';
  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __GIT_SHA__: JSON.stringify(shortSha()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'prompt' (not 'autoUpdate'): autoUpdate reloads the page silently
        // the moment a new SW activates, with no user-visible signal either
        // way — that silence was the root cause of "did my refresh actually
        // update the app?" (dev plan §14.1). 'prompt' instead surfaces
        // needRefresh via useRegisterSW, so the update is explicit.
        registerType: 'prompt',
        // We register the SW ourselves via virtual:pwa-register/react
        // (UpdateBanner) — disable the auto-injected register script to
        // avoid a second, competing registration.
        injectRegister: false,
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
