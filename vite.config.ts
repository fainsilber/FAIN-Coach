/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

// Deploy target (dev plan §12.1). Two deployments are live at once and CI
// builds each separately — they are different origins, so they share code but
// never share data (IndexedDB is per-origin).
//
// `base` is the single switch: the router basename
// (`import.meta.env.BASE_URL`), the PWA scope/start_url, and the precache
// manifest all derive from it. Never hard-code the subpath anywhere else.
type DeployTarget = 'cloudflare' | 'pages';

const BASE_BY_TARGET: Record<DeployTarget, string> = {
  cloudflare: '/', // root domain
  pages: '/FAIN-Coach/', // GitHub Pages project subpath
};

// Files in public/ that belong to exactly one target. Vite copies all of
// public/ into every build, so the ones that don't belong are deleted after
// the write: a Cloudflare build must not ship the GitHub Pages redirect shim
// (404.html hard-codes pathSegmentsToKeep=1, which is wrong at a root domain,
// and Cloudflare would otherwise serve it as the not-found page). Cloudflare
// itself needs no equivalent file here — see the note below.
const TARGET_ONLY_FILES: Record<DeployTarget, readonly string[]> = {
  pages: ['404.html'],
  cloudflare: [],
};

/**
 * Which Dexie Cloud database each deployment talks to (dev plan §12.2).
 *
 * This is the switch between the two tiers, and it is deliberately per-TARGET
 * rather than a runtime toggle inside the app:
 *
 * - `pages` → **null**. GitHub Pages is the free tier: fully local, no
 *   accounts, no sign-in, and the cloud addon is not even in the bundle.
 * - `cloudflare` → the cloud database. That deployment is the Sync tier and
 *   requires signing in; the account is the identity, so local profiles don't
 *   apply there.
 *
 * Committed rather than dashboard-configured because the database URL is not a
 * secret — it only names which database to talk to. The credential is the
 * CLI's `dexie-cloud.key`, which stays on the owner's machine and is
 * gitignored (docs/dexie-cloud-setup.md). Keeping it here means the two
 * deployments' behaviour is visible in the repo instead of hidden in two
 * different hosting dashboards.
 *
 * `VITE_DEXIE_CLOUD_URL` overrides, which is how you point a build at a
 * different database (or enable cloud in local dev).
 */
const CLOUD_URL_BY_TARGET: Record<DeployTarget, string | null> = {
  pages: null,
  cloudflare: 'https://z18kml7kr.dexie.cloud',
};

/**
 * Where the Garmin import Worker lives (dev plan §15.1 stage B).
 *
 * `''` means **same origin** — on Cloudflare the Worker serves the app and the
 * `/api/garmin/*` routes from one deployment, so no absolute URL is needed and
 * there is no CORS hop.
 *
 * `null` means the deployment has no Worker, and the Garmin connect UI is not
 * rendered at all. GitHub Pages is static-only, so it gets null. It *could* be
 * pointed at the Cloudflare Worker cross-origin (the Worker sends CORS headers
 * for exactly that reason), but that would couple the free tier to the paid
 * deployment's infrastructure, so it is opt-in rather than the default.
 *
 * `VITE_GARMIN_WORKER_URL` overrides — that is how you point `npm run dev` at a
 * local `wrangler dev` on :8787.
 */
const GARMIN_WORKER_BY_TARGET: Record<DeployTarget, string | null> = {
  pages: null,
  cloudflare: '',
};

// No public/_redirects for the Cloudflare target: an earlier version of this
// file shipped one (`/* /index.html 200`, the classic Pages SPA-fallback
// idiom) and it broke the deploy outright. Cloudflare's current import flow
// provisions a Worker with static assets (`wrangler deploy`, an
// auto-generated wrangler.jsonc with `assets.not_found_handling:
// "single-page-application"`), which already does SPA fallback natively.
// The custom _redirects rule collided with that platform's own URL
// normalization (which strips `.html`/`/index` and redirects) and Cloudflare's
// deploy-time validator correctly refused it as an infinite loop. Don't
// re-add a _redirects file without checking which deploy product is
// actually in use.

function resolveTarget(): DeployTarget {
  const raw = process.env.DEPLOY_TARGET ?? 'cloudflare';
  // hasOwnProperty, not `in` — `in` walks the prototype chain, so a
  // DEPLOY_TARGET of "toString" would otherwise pass validation.
  if (!Object.prototype.hasOwnProperty.call(BASE_BY_TARGET, raw)) {
    throw new Error(
      `Unknown DEPLOY_TARGET "${raw}". Expected one of: ` +
        `${Object.keys(BASE_BY_TARGET).join(', ')}.`,
    );
  }
  return raw as DeployTarget;
}

/**
 * Removes the public/ files that belong to a *different* deploy target.
 *
 * `order: 'pre'` is load-bearing, not decoration: vite-plugin-pwa globs the
 * output directory to build its precache manifest in its own closeBundle. If
 * this ran after, the Cloudflare service worker would precache a 404.html that
 * no longer exists on disk, and SW installation fails outright on a missing
 * precache entry. Strip first, generate the manifest second.
 */
function stripForeignTargetFiles(target: DeployTarget, outDir: string): Plugin {
  return {
    name: 'strip-foreign-target-files',
    apply: 'build',
    closeBundle: {
      order: 'pre',
      handler() {
        for (const [candidate, files] of Object.entries(TARGET_ONLY_FILES)) {
          if (candidate === target) continue;
          for (const file of files) {
            rmSync(path.resolve(outDir, file), { force: true });
          }
        }
      },
    },
  };
}

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

export default defineConfig(({ command, isPreview }) => {
  const target = resolveTarget();
  const outDir = path.resolve(__dirname, 'dist');
  // The dev server is not a deployment — it always serves at '/'. `vite
  // preview` serves the built artifact, so it must match the build's base.
  const isDevServer = command === 'serve' && !isPreview;
  const base = isDevServer ? '/' : BASE_BY_TARGET[target];
  // Dev stays LOCAL by default even though the default target is `cloudflare`,
  // so day-to-day work isn't gated behind a sign-in. Set VITE_DEXIE_CLOUD_URL
  // explicitly to exercise the cloud path in dev.
  const cloudUrl =
    process.env.VITE_DEXIE_CLOUD_URL ??
    (isDevServer ? null : CLOUD_URL_BY_TARGET[target]);
  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __GIT_SHA__: JSON.stringify(shortSha()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      // Dexie Cloud (dev plan §12.2). `define` rather than import.meta.env so
      // an unset variable becomes the literal `null`, which lets Rollup prove
      // the cloud branch dead and drop dexie-cloud-addon (~240 kB) from a
      // local-only build. Not a secret — see docs/dexie-cloud-setup.md.
      __CLOUD_DATABASE_URL__: JSON.stringify(cloudUrl ?? null),
      // Garmin import Worker (§15.1 stage B). Same `define` reasoning as
      // above: a literal null lets Rollup drop the whole feature from a build
      // that has no Worker. Not a secret — it is only an address.
      __GARMIN_WORKER_URL__: JSON.stringify(
        process.env.VITE_GARMIN_WORKER_URL ??
          (isDevServer ? null : GARMIN_WORKER_BY_TARGET[target]),
      ),
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
      stripForeignTargetFiles(target, outDir),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Keep dexie-cloud-addon out of local-only builds entirely. A Dexie
        // addon mutates the Dexie prototype at import time, so Rollup cannot
        // tree-shake it even when the branch constructing the cloud database
        // is provably dead — aliasing it to a throwing stub is the only
        // reliable way to stop ~240 kB shipping to free-tier users who can
        // never use it. See src/db/dexieCloudStub.ts.
        ...(cloudUrl
          ? {}
          : {
              'dexie-cloud-addon': path.resolve(
                __dirname,
                './src/db/dexieCloudStub.ts',
              ),
            }),
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
