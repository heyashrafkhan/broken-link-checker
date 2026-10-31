/**
 * Core type definitions for the broken-link-checker crawler engine.
 */

/** Configuration for a single scan run. */
export interface ScanConfig {
  scanId: string;
  /** The starting URL for the crawl. */
  targetUrl: string;
  /** Maximum number of concurrent requests globally. Default 30. */
  maxConcurrency: number;
  /** Maximum number of concurrent requests per host. Default 20. */
  maxConcurrencyPerHost: number;
  /** Per-request timeout in milliseconds. Default 10000. */
  requestTimeout: number;
  /** Whether to follow HTTP redirects. Default true. */
  followRedirects: boolean;
  /** Maximum number of redirects to follow per request. Default 5. */
  maxRedirects: number;
  /** Whether to respect robots.txt rules. Default true. */
  respectRobotsTxt: boolean;
  /** Whether to check links to external domains. Default true. */
  checkExternalLinks: boolean;
  /** User-Agent header string sent with every request. */
  userAgent: string;
  /** Maximum number of pages to crawl. 0 = unlimited. */
  maxPages: number;
}

/** Describes a single extracted link before it is checked. */
export interface ExtractedLink {
  url: string;
  tagName: string;
  attribute: string;
  anchorText: string;
}

/** Result of checking a single link on a page. */
export interface LinkResult {
  scanId: string;
  /** The page where the link was found. */
  sourceUrl: string;
  /** The resolved URL the link points to. */
  targetUrl: string;
  /** The HTML tag that contained the link ('a', 'img', 'link', 'script', 'iframe'). */
  tagName: string;
  /** The attribute that contained the URL ('href', 'src'). */
  attribute: string;
  /** Inner text of <a> tags or alt text of <img> tags. */
  anchorText: string;
  /** HTTP status code, or null if the request failed before getting a response. */
  statusCode: number | null;
  /** Classification of the error, or 'none' if the link is reachable. */
  errorType:
    | 'none'
    | 'timeout'
    | 'dns'
    | 'ssl'
    | 'connection'
    | 'redirect-loop'
    | 'http-error'
    | 'invalid-url';
  /** Human-readable error message (empty string when errorType is 'none'). */
  errorMessage: string;
  /** Round-trip time in milliseconds. */
  responseTimeMs: number;
  /** Whether the link target is on the same origin as the scan target. */
  isInternal: boolean;
  /** Whether the link is considered broken (4xx/5xx or network error). */
  isBroken: boolean;
  /** Ordered list of URLs in the redirect chain (empty if no redirects). */
  redirectChain: string[];
  /** Unix timestamp (ms) when the check completed. */
  timestamp: number;
}

/** Real-time progress snapshot of a running scan. */
export interface ScanProgress {
  scanId: string;
  status: 'running' | 'paused' | 'completed' | 'error';
  pagesScanned: number;
  pagesQueued: number;
  linksChecked: number;
  brokenLinksFound: number;
  /** Unix timestamp (ms) when the scan started. */
  startedAt: number;
  /** Elapsed wall-clock time in milliseconds. */
  elapsedMs: number;
  /** The URL currently being processed. */
  currentUrl: string;
  /** Throughput measurement: pages scanned per second. */
  pagesPerSecond: number;
}

/** Discriminated union of events emitted during a scan. */
export type ScanEventType =
  | 'progress'
  | 'link-result'
  | 'page-scanned'
  | 'scan-complete'
  | 'scan-error';

export interface ScanEvent {
  type: ScanEventType;
  data: LinkResult | ScanProgress | { scanId: string; error: string };
}

/** Result shape returned by the HTTP client's checkUrl method. */
export interface HttpCheckResult {
  statusCode: number;
  errorType: string;
  errorMessage: string;
  responseTimeMs: number;
  redirectChain: string[];
  body?: string;
  contentType?: string;
}

/** Result shape returned by the HTTP client's fetchPage method. */
export interface HttpFetchResult {
  statusCode: number;
  body: string;
  contentType: string;
  responseTimeMs: number;
}
