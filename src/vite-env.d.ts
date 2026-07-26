/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Build identity, injected via `define` in vite.config.ts (dev plan §14.2).
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_TIME__: string;
