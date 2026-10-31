/**
 * robots.txt and sitemap.xml handler.
 *
 * Fetches and parses robots.txt for the target domain, then exposes helpers
 * to check whether a URL is crawlable and to retrieve crawl-delay / sitemap
 * directives. Also provides sitemap.xml parsing (including sitemap index
 * files) using simple regex extraction for `<loc>` tags.
 */

import robotsParser from 'robots-parser';
import { fetchPage } from './http-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed robots.txt wrapper. */
type RobotsInstance = ReturnType<typeof robotsParser>;

// ---------------------------------------------------------------------------
// RobotsHandler class
// ---------------------------------------------------------------------------

/**
 * Manages robots.txt state for a single crawl target.
 */
export class RobotsHandler {
  private robots: RobotsInstance | null = null;
  private loaded = false;
  private sitemapUrls: string[] = [];
  private crawlDelay = 0;

  /**
   * Fetch and parse the robots.txt file for the given base URL.
   *
   * @param baseUrl  — Origin URL (e.g. "https://example.com")
   * @param userAgent — The User-Agent to match rules against
   */
  async load(baseUrl: string, userAgent: string): Promise<void> {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).href;
      const result = await fetchPage(robotsUrl, {
        timeout: 10_000,
        userAgent,
        maxRedirects: 3,
      });

      if (result.statusCode === 200 && result.body) {
        this.robots = robotsParser(robotsUrl, result.body);

        // Extract crawl delay
        const delay = this.robots.getCrawlDelay(userAgent);
        this.crawlDelay = delay ? delay * 1000 : 0; // convert seconds → ms

        // Extract sitemap URLs declared in robots.txt
        const sitemaps = this.robots.getSitemaps();
        this.sitemapUrls = sitemaps ?? [];
      }
    } catch {
      // If robots.txt is unreachable, assume everything is allowed
      this.robots = null;
    }

    this.loaded = true;
  }

  /**
   * Check whether a URL is allowed by the parsed robots.txt rules.
   * If robots.txt was not loaded or failed, this returns `true` (allow all).
   */
  isAllowed(url: string): boolean {
    if (!this.robots) return true;
    // robots-parser returns undefined when there is no matching rule
    return this.robots.isAllowed(url) !== false;
  }

  /**
   * Return the crawl delay in milliseconds (0 if none specified).
   */
  getCrawlDelay(): number {
    return this.crawlDelay;
  }

  /**
   * Return the list of sitemap URLs declared in robots.txt.
   */
  getSitemapUrls(): string[] {
    return this.sitemapUrls;
  }
}

// ---------------------------------------------------------------------------
// Sitemap parser
// ---------------------------------------------------------------------------

/** Regex to extract <loc> values from sitemap XML. */
const LOC_REGEX = /<loc>\s*(.*?)\s*<\/loc>/gi;

/** Max recursion depth for sitemap index → child sitemaps. */
const MAX_SITEMAP_DEPTH = 3;

/**
 * Fetch a sitemap.xml (or sitemap index) and return all page URLs found.
 *
 * If the sitemap is an index file (contains `<sitemap>` elements), each
 * child sitemap is fetched recursively up to `MAX_SITEMAP_DEPTH` levels.
 *
 * @param sitemapUrl — Absolute URL of the sitemap
 * @param userAgent  — User-Agent for the fetch
 * @param depth      — Current recursion depth (internal use)
 */
export async function fetchSitemapUrls(
  sitemapUrl: string,
  userAgent: string = 'BLC-Bot/1.0',
  depth: number = 0,
): Promise<string[]> {
  if (depth > MAX_SITEMAP_DEPTH) return [];

  try {
    const result = await fetchPage(sitemapUrl, {
      timeout: 15_000,
      userAgent,
      maxRedirects: 3,
    });

    if (result.statusCode !== 200 || !result.body) return [];

    const body = result.body;
    const urls: string[] = [];

    // Check if this is a sitemap index by looking for <sitemap> tags
    const isSitemapIndex = body.includes('<sitemap>') || body.includes('<sitemapindex');

    // Extract all <loc> values
    let match: RegExpExecArray | null;
    const locs: string[] = [];
    while ((match = LOC_REGEX.exec(body)) !== null) {
      const loc = match[1].trim();
      if (loc) locs.push(loc);
    }

    if (isSitemapIndex) {
      // Each <loc> is a child sitemap — fetch recursively
      const childResults = await Promise.allSettled(
        locs.map((childUrl) => fetchSitemapUrls(childUrl, userAgent, depth + 1)),
      );
      for (const res of childResults) {
        if (res.status === 'fulfilled') {
          urls.push(...res.value);
        }
      }
    } else {
      // Regular sitemap — <loc> values are page URLs
      urls.push(...locs);
    }

    return urls;
  } catch {
    return [];
  }
}
