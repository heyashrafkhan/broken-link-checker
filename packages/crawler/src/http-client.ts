/**
 * Optimized HTTP client built on undici connection pools.
 *
 * Maintains per-origin `Pool` instances for keep-alive connection reuse.
 * Provides two primary methods:
 *  - `checkUrl`  — HEAD-then-GET probe to verify a link is reachable
 *  - `fetchPage` — Full GET that returns the HTML body for crawling
 *
 * An LRU eviction strategy caps the pool map at 100 origins.
 */

import { Pool } from 'undici';
import type { HttpCheckResult, HttpFetchResult } from './types.js';

/** Maximum number of undici Pool instances to keep alive. */
const MAX_POOLS = 100;

/** Maximum response body size we'll buffer (5 MB). */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Pool management (LRU map keyed by origin)
// ---------------------------------------------------------------------------

const pools = new Map<string, Pool>();

/**
 * Return (or create) a connection pool for the given origin.
 * Evicts the oldest pool when the map exceeds MAX_POOLS.
 */
function getPool(origin: string): Pool {
  let pool = pools.get(origin);
  if (pool) {
    // Move to end (most-recently used) by re-inserting
    pools.delete(origin);
    pools.set(origin, pool);
    return pool;
  }

  // Evict least-recently used if at capacity
  if (pools.size >= MAX_POOLS) {
    const oldest = pools.keys().next().value!;
    const evicted = pools.get(oldest);
    pools.delete(oldest);
    evicted?.close().catch(() => {});
  }

  pool = new Pool(origin, {
    pipelining: 1,
    connections: 6,
    keepAliveTimeout: 30_000,
    headersTimeout: 15_000,
  });
  pools.set(origin, pool);
  return pool;
}

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Map a low-level error to a user-friendly errorType string.
 */
function classifyError(err: unknown): { errorType: string; errorMessage: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('headerstimeout')) {
    return { errorType: 'timeout', errorMessage: msg };
  }
  if (lower.includes('getaddrinfo') || lower.includes('enotfound') || lower.includes('dns')) {
    return { errorType: 'dns', errorMessage: msg };
  }
  if (lower.includes('cert') || lower.includes('ssl') || lower.includes('tls') || lower.includes('unable to verify')) {
    return { errorType: 'ssl', errorMessage: msg };
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('epipe') ||
    lower.includes('socket hang up') ||
    lower.includes('connect')
  ) {
    return { errorType: 'connection', errorMessage: msg };
  }
  return { errorType: 'connection', errorMessage: msg };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe a URL to determine reachability and HTTP status.
 *
 * Strategy:
 *  1. Send a HEAD request.
 *  2. If the server returns 405 (Method Not Allowed), retry with GET
 *     using a `Range: bytes=0-8192` header to limit bandwidth.
 *  3. Manually follow redirects up to `maxRedirects`, tracking each hop.
 *  4. Detect redirect loops by checking for repeated URLs in the chain.
 */
export async function checkUrl(
  url: string,
  config: { timeout: number; userAgent: string; maxRedirects: number },
): Promise<HttpCheckResult> {
  const { timeout, userAgent, maxRedirects } = config;
  const redirectChain: string[] = [];
  let currentUrl = url;
  const startTime = performance.now();

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      // Parse origin and path from the current URL
      const parsed = new URL(currentUrl);
      const origin = parsed.origin;
      const path = parsed.pathname + parsed.search;
      const pool = getPool(origin);

      // Decide method: HEAD first, GET fallback handled below
      const method = hop === 0 ? 'HEAD' : 'GET';

      const { statusCode, headers, body } = await pool.request({
        method,
        path: parsed.pathname + parsed.search,
        headers: {
          'user-agent': userAgent || BROWSER_UA,
          accept: BROWSER_ACCEPT,
          'accept-language': 'en-US,en;q=0.9',
          ...(method === 'GET' ? { range: 'bytes=0-8192' } : {}),
        },
        signal: AbortSignal.timeout(timeout),
      });

      // Always consume the body to free the socket
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(chunk as Buffer);
        // Stop reading after 16 KB (we don't need the whole body for a check)
        if (chunks.reduce((s, c) => s + c.length, 0) > 16_384) break;
      }

      // If HEAD returns 405/406/403/400 (server blocks empty HEAD), retry with scoped GET
      if (
        method === 'HEAD' &&
        (statusCode === 405 || statusCode === 406 || statusCode === 403 || statusCode === 400)
      ) {
        const getResult = await pool.request({
          method: 'GET',
          path: parsed.pathname + parsed.search,
          headers: {
            'user-agent': userAgent || BROWSER_UA,
            accept: BROWSER_ACCEPT,
            'accept-language': 'en-US,en;q=0.9',
            range: 'bytes=0-8192',
          },
          signal: AbortSignal.timeout(timeout),
        });

        const getChunks: Buffer[] = [];
        for await (const chunk of getResult.body) {
          getChunks.push(chunk as Buffer);
          if (getChunks.reduce((s, c) => s + c.length, 0) > 16_384) break;
        }

        const elapsed = performance.now() - startTime;
        const contentType = String(getResult.headers['content-type'] ?? '');
        const bodyStr = Buffer.concat(getChunks).toString('utf-8');

        return {
          statusCode: getResult.statusCode,
          errorType: getResult.statusCode >= 400 ? 'http-error' : 'none',
          errorMessage: getResult.statusCode >= 400 ? `HTTP ${getResult.statusCode}` : '',
          responseTimeMs: Math.round(elapsed),
          redirectChain,
          body: bodyStr,
          contentType,
        };
      }

      // Handle redirects (3xx with Location header)
      if (statusCode >= 300 && statusCode < 400) {
        const location = headers['location'];
        if (!location) {
          // Redirect without Location → treat as the final status
          const elapsed = performance.now() - startTime;
          return {
            statusCode,
            errorType: 'http-error',
            errorMessage: `Redirect ${statusCode} without Location header`,
            responseTimeMs: Math.round(elapsed),
            redirectChain,
          };
        }

        const nextUrl = new URL(String(location), currentUrl).href;

        // Detect redirect loop
        if (redirectChain.includes(nextUrl) || nextUrl === currentUrl) {
          const elapsed = performance.now() - startTime;
          return {
            statusCode,
            errorType: 'redirect-loop',
            errorMessage: `Redirect loop detected: ${nextUrl}`,
            responseTimeMs: Math.round(elapsed),
            redirectChain,
          };
        }

        redirectChain.push(currentUrl);
        currentUrl = nextUrl;
        continue;
      }

      // Final response — not a redirect
      const elapsed = performance.now() - startTime;
      const contentType = String(headers['content-type'] ?? '');
      const bodyStr = Buffer.concat(chunks).toString('utf-8');

      return {
        statusCode,
        errorType: statusCode >= 400 ? 'http-error' : 'none',
        errorMessage: statusCode >= 400 ? `HTTP ${statusCode}` : '',
        responseTimeMs: Math.round(elapsed),
        redirectChain,
        body: bodyStr,
        contentType,
      };
    }

    // Exceeded max redirects
    const elapsed = performance.now() - startTime;
    return {
      statusCode: 0,
      errorType: 'redirect-loop',
      errorMessage: `Exceeded maximum redirects (${maxRedirects})`,
      responseTimeMs: Math.round(elapsed),
      redirectChain,
    };
  } catch (err) {
    const elapsed = performance.now() - startTime;
    const { errorType, errorMessage } = classifyError(err);
    return {
      statusCode: 0,
      errorType,
      errorMessage,
      responseTimeMs: Math.round(elapsed),
      redirectChain,
    };
  }
}

/**
 * Fetch a full page for crawling (internal pages only).
 *
 * Performs a GET request and returns the body only if the Content-Type
 * indicates HTML. The body is capped at 5 MB.
 */
export async function fetchPage(
  url: string,
  config: { timeout: number; userAgent: string; maxRedirects: number },
): Promise<HttpFetchResult> {
  const { timeout, userAgent, maxRedirects } = config;
  const startTime = performance.now();

  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    const path = parsed.pathname + parsed.search;
    const pool = getPool(origin);

    let currentUrl = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const parsed = new URL(currentUrl);
      const origin = parsed.origin;
      const path = parsed.pathname + parsed.search;
      const pool = getPool(origin);

      const { statusCode, headers, body } = await pool.request({
        method: 'GET',
        path: parsed.pathname + parsed.search,
        headers: {
          'user-agent': userAgent || BROWSER_UA,
          accept: BROWSER_ACCEPT,
          'accept-language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(timeout),
      });

      if (statusCode >= 300 && statusCode < 400 && headers['location']) {
        // Drain body and follow redirect
        for await (const _ of body) {}
        currentUrl = new URL(String(headers['location']), currentUrl).href;
        continue;
      }

      const contentType = String(headers['content-type'] ?? '').toLowerCase();
      const isCollectable =
        contentType.includes('text/html') ||
        contentType.includes('text/plain') ||
        contentType.includes('xml');

      // Collect body, but only if HTML/text/XML (otherwise discard to save memory)
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of body) {
        if (isCollectable) {
          chunks.push(chunk as Buffer);
          totalBytes += (chunk as Buffer).length;
          if (totalBytes > MAX_BODY_BYTES) break; // hard cap at 5 MB
        }
      }

      const elapsed = performance.now() - startTime;

      return {
        statusCode,
        body: isCollectable ? Buffer.concat(chunks).toString('utf-8') : '',
        contentType,
        responseTimeMs: Math.round(elapsed),
      };
    }

    return {
      statusCode: 0,
      body: '',
      contentType: '',
      responseTimeMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    const elapsed = performance.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 0,
      body: '',
      contentType: '',
      responseTimeMs: Math.round(elapsed),
    };
  }
}

/**
 * Gracefully close all connection pools. Call on process shutdown.
 */
export async function closeAllPools(): Promise<void> {
  const closing = Array.from(pools.values()).map((p) => p.close());
  pools.clear();
  await Promise.allSettled(closing);
}
