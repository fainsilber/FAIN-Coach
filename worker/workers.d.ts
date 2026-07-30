/**
 * The two Cloudflare runtime types this Worker actually uses.
 *
 * Declared here rather than depending on `@cloudflare/workers-types`: that
 * package pulls a large global type surface that conflicts with the app's DOM
 * lib, and we need precisely two interfaces. If the Worker ever grows beyond
 * KV and static assets, take the dependency properly instead of extending this.
 */

export interface KVNamespace {
  get(key: string, type: 'text'): Promise<string | null>;
  get<T>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** A binding that serves the built static assets. */
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
