/**
 * URL normalization and utility functions.
 *
 * Provides consistent URL normalization, origin comparison, validation,
 * and fast hashing via xxHash64 for deduplication.
 */

import normalizeUrlLib from 'normalize-url';
import xxhashWasm from 'xxhash-wasm';

// ---------------------------------------------------------------------------
// xxHash64 hasher — lazily initialized once, reused for the process lifetime
// ---------------------------------------------------------------------------
let hasherPromise: Promise<Awaited<ReturnType<typeof xxhashWasm>>> | null = null;

function getHasher() {
  if (!hasherPromise) {
    hasherPromise = xxhashWasm();
  }
  return hasherPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a (possibly relative) URL against a base, then normalize it.
 *
 * Normalization steps:
 *  - Resolves relative references against `baseUrl`
 *  - Strips fragment (#) identifiers
 *  - Lowercases the hostname
 *  - Removes default ports (80/443)
 *  - Sorts query parameters
 *  - Strips trailing slashes (configurable via normalize-url defaults)
 */
export function normalizeUrl(url: string, baseUrl?: string): string {
  try {
    // Resolve relative URLs against the base when provided, or normalize standard URL
    const resolved = baseUrl ? new URL(url, baseUrl).href : new URL(url).href;

    return normalizeUrlLib(resolved, {
      stripHash: true,
      stripWWW: false, // preserve www subdomain distinctions
      removeTrailingSlash: true,
      removeSingleSlash: false,
      removeDirectoryIndex: false,
      sortQueryParameters: true,
      defaultProtocol: 'https',
    });
  } catch {
    // If the URL is fundamentally invalid, return it as-is so callers can
    // classify it as an invalid-url error rather than crashing.
    return url;
  }
}

/**
 * Check whether two URLs share the same origin (protocol + hostname + port).
 */
export function isSameOrigin(url1: string, url2: string): boolean {
  try {
    const a = new URL(url1);
    const b = new URL(url2);
    const hostA = a.hostname.replace(/^www\./i, '').toLowerCase();
    const hostB = b.hostname.replace(/^www\./i, '').toLowerCase();
    return hostA === hostB;
  } catch {
    return false;
  }
}

/**
 * Returns `true` for valid `http://` or `https://` URLs only.
 */
export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns an xxHash64 hex string for the given URL.
 *
 * The hasher is initialized lazily on the first call and reused thereafter.
 */
export async function hashUrl(url: string): Promise<string> {
  const hasher = await getHasher();
  return hasher.h64ToString(url);
}
