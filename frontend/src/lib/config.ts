const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4300';

/** Trailing slashes would produce `//api/v1` once route builders are appended. */
function _stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * The only place this app reads the environment. Next.js inlines `NEXT_PUBLIC_*` at
 * build time, so this resolves once and is frozen for the lifetime of the bundle.
 */
export const ClientConfig = Object.freeze({
  apiBaseUrl: _stripTrailingSlash(process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL),
});
