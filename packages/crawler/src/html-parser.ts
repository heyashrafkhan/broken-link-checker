/**
 * HTML link extraction using cheerio.
 *
 * Parses an HTML document and extracts all actionable links from anchor tags,
 * images, stylesheets, scripts, and iframes. Relative URLs are resolved
 * against the provided base URL and non-HTTP schemes are filtered out.
 */

import * as cheerio from 'cheerio';
import { normalizeUrl, isValidHttpUrl } from './url-utils.js';
import type { ExtractedLink } from './types.js';

/** Schemes we explicitly ignore when extracting links. */
const IGNORED_PREFIXES = ['mailto:', 'tel:', 'javascript:', 'data:'];

/**
 * Returns true if the raw href/src value should be skipped
 * (empty, fragment-only, or non-HTTP scheme).
 */
function shouldSkip(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '#') return true;
  return IGNORED_PREFIXES.some((p) => trimmed.toLowerCase().startsWith(p));
}

/**
 * Extract all links from an HTML string, resolved against `baseUrl`.
 *
 * Supported elements:
 *  - `<a href>`          → tag='a',      attribute='href',  anchorText = inner text
 *  - `<img src>`         → tag='img',    attribute='src',   anchorText = alt text
 *  - `<link href>`       → tag='link',   attribute='href',  anchorText = ''
 *  - `<script src>`      → tag='script', attribute='src',   anchorText = ''
 *  - `<iframe src>`      → tag='iframe', attribute='src',   anchorText = ''
 */
export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const $ = cheerio.load(html);
  const links: ExtractedLink[] = [];

  // ── <a href> ──────────────────────────────────────────────────────────
  $('a[href]').each((_i, el) => {
    const raw = $(el).attr('href') ?? '';
    if (shouldSkip(raw)) return;

    const resolved = normalizeUrl(raw, baseUrl);
    if (!isValidHttpUrl(resolved)) return;

    links.push({
      url: resolved,
      tagName: 'a',
      attribute: 'href',
      anchorText: $(el).text().trim().slice(0, 200), // cap text length
    });
  });

  // ── <img src> ─────────────────────────────────────────────────────────
  $('img[src]').each((_i, el) => {
    const raw = $(el).attr('src') ?? '';
    if (shouldSkip(raw)) return;

    const resolved = normalizeUrl(raw, baseUrl);
    if (!isValidHttpUrl(resolved)) return;

    links.push({
      url: resolved,
      tagName: 'img',
      attribute: 'src',
      anchorText: ($(el).attr('alt') ?? '').trim().slice(0, 200),
    });
  });

  // ── <link href> ───────────────────────────────────────────────────────
  $('link[href]').each((_i, el) => {
    const raw = $(el).attr('href') ?? '';
    if (shouldSkip(raw)) return;

    const resolved = normalizeUrl(raw, baseUrl);
    if (!isValidHttpUrl(resolved)) return;

    links.push({
      url: resolved,
      tagName: 'link',
      attribute: 'href',
      anchorText: '',
    });
  });

  // ── <script src> ──────────────────────────────────────────────────────
  $('script[src]').each((_i, el) => {
    const raw = $(el).attr('src') ?? '';
    if (shouldSkip(raw)) return;

    const resolved = normalizeUrl(raw, baseUrl);
    if (!isValidHttpUrl(resolved)) return;

    links.push({
      url: resolved,
      tagName: 'script',
      attribute: 'src',
      anchorText: '',
    });
  });

  // ── <iframe src> ──────────────────────────────────────────────────────
  $('iframe[src]').each((_i, el) => {
    const raw = $(el).attr('src') ?? '';
    if (shouldSkip(raw)) return;

    const resolved = normalizeUrl(raw, baseUrl);
    if (!isValidHttpUrl(resolved)) return;

    links.push({
      url: resolved,
      tagName: 'iframe',
      attribute: 'src',
      anchorText: '',
    });
  });

  return links;
}
