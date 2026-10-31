/**
 * Main BFS crawler engine.
 *
 * Orchestrates the entire crawl: seeds the URL queue from the target URL and
 * sitemap, spawns a pool of async workers that fetch pages and check links,
 * enforces per-host concurrency limits and crawl-delay directives, and emits
 * real-time events for every link result, page completion, and progress tick.
 *
 * Usage:
 * ```ts
 * const crawler = new Crawler(config);
 * crawler.on('link-result', (lr) => { ... });
 * crawler.on('progress',    (p)  => { ... });
 * crawler.on('complete',    ()   => { ... });
 * await crawler.start();
 * ```
 */

import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import pino from 'pino';

import type { ScanConfig, LinkResult, ScanProgress, ExtractedLink } from './types.js';
import { normalizeUrl, isSameOrigin, isValidHttpUrl } from './url-utils.js';
import { extractLinks } from './html-parser.js';
import { checkUrl, fetchPage, closeAllPools } from './http-client.js';
import { RobotsHandler, fetchSitemapUrls } from './robots-handler.js';
import { DedupStore } from './dedup-store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often (ms) the progress event fires. */
const PROGRESS_INTERVAL_MS = 1_000;

/**
 * If more than this many unique URLs share the same URL "pattern" we stop
 * following that pattern to avoid infinite-crawl traps (e.g. calendar pages
 * with incrementing date parameters).
 */
const URL_PATTERN_CAP = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a "pattern key" from a URL by replacing every purely-numeric path
 * segment and every query-parameter value with a placeholder.
 *
 * Example:
 *   /blog/posts/42?page=3  →  /blog/posts/{n}?page={v}
 *
 * This lets us detect URL families that keep producing unique variants.
 */
function urlPatternKey(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').map((seg) =>
      /^\d+$/.test(seg) ? '{n}' : seg,
    );
    const params = Array.from(parsed.searchParams.keys())
      .sort()
      .map((k) => `${k}={v}`)
      .join('&');
    return `${parsed.hostname}${pathParts.join('/')}${params ? '?' + params : ''}`;
  } catch {
    return url;
  }
}

/**
 * Hostname extractor (returns empty string on invalid URLs).
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Async queue (simple array + waiting resolvers)
// ---------------------------------------------------------------------------

/**
 * A minimal async queue: workers call `dequeue()` which returns a promise
 * that resolves as soon as an item is available. `enqueue()` feeds items in.
 */
class AsyncQueue<T> {
  private buffer: T[] = [];
  private waiters: Array<(value: T | null) => void> = [];
  private closed = false;

  enqueue(item: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
    } else {
      this.buffer.push(item);
    }
  }

  dequeue(): Promise<T | null> {
    if (this.buffer.length > 0) {
      return Promise.resolve(this.buffer.shift()!);
    }
    if (this.closed) {
      return Promise.resolve(null);
    }
    return new Promise<T | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Signal that no more items will be enqueued. Unblocks all waiters. */
  close(): void {
    this.closed = true;
    for (const w of this.waiters) w(null);
    this.waiters.length = 0;
  }

  get size(): number {
    return this.buffer.length;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

// ---------------------------------------------------------------------------
// Per-host semaphore
// ---------------------------------------------------------------------------

/**
 * A counting semaphore that caps concurrency for a given key (hostname).
 */
class HostSemaphore {
  private counts = new Map<string, number>();
  private waiters = new Map<string, Array<() => void>>();

  constructor(private maxPerHost: number) {}

  async acquire(host: string): Promise<void> {
    const current = this.counts.get(host) ?? 0;
    if (current < this.maxPerHost) {
      this.counts.set(host, current + 1);
      return;
    }
    // Wait until a slot opens up
    return new Promise<void>((resolve) => {
      let list = this.waiters.get(host);
      if (!list) {
        list = [];
        this.waiters.set(host, list);
      }
      list.push(resolve);
    });
  }

  release(host: string): void {
    const current = this.counts.get(host) ?? 1;
    const list = this.waiters.get(host);
    if (list && list.length > 0) {
      // Hand the slot directly to a waiter
      const next = list.shift()!;
      if (list.length === 0) this.waiters.delete(host);
      next();
    } else {
      const next = current - 1;
      if (next <= 0) {
        this.counts.delete(host);
      } else {
        this.counts.set(host, next);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Crawler
// ---------------------------------------------------------------------------

export class Crawler extends EventEmitter {
  private readonly config: ScanConfig;
  private readonly redis?: Redis;
  private readonly log;

  // State
  private status: 'idle' | 'running' | 'paused' | 'completed' | 'error' = 'idle';
  private abortController = new AbortController();
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  // Metrics
  private pagesScanned = 0;
  private linksChecked = 0;
  private brokenLinksFound = 0;
  private startedAt = 0;
  private currentUrl = '';

  // Subsystems
  private dedup!: DedupStore;
  private robotsHandler!: RobotsHandler;
  private queue!: AsyncQueue<string>;
  private hostSemaphore!: HostSemaphore;
  private urlPatternCounts = new Map<string, number>();
  private enqueuedUrls = new Set<string>();
  private verifiedTargetResults = new Map<
    string,
    {
      statusCode: number | null;
      errorType: LinkResult['errorType'];
      errorMessage: string;
      responseTimeMs: number;
      redirectChain: string[];
      isBroken: boolean;
    }
  >();
  private pendingChecks = new Map<
    string,
    Promise<{
      statusCode: number | null;
      errorType: LinkResult['errorType'];
      errorMessage: string;
      responseTimeMs: number;
      redirectChain: string[];
      isBroken: boolean;
    }>
  >();

  // Crawl-delay tracking per host (timestamp of last request)
  private lastRequestByHost = new Map<string, number>();
  private crawlDelayMs = 0;

  // Worker tracking
  private activeWorkers = 0;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ScanConfig> & { scanId: string; targetUrl: string }, redis?: Redis) {
    super();
    this.config = {
      maxConcurrency: 30,
      maxConcurrencyPerHost: 20,
      requestTimeout: 8_000,
      followRedirects: true,
      maxRedirects: 5,
      respectRobotsTxt: true,
      checkExternalLinks: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (BrokenLinkScanner/1.0)',
      maxPages: 0,
      ...config,
    };
    this.redis = redis;
    this.log = pino({ name: 'crawler', level: 'info' });
  }

  // -----------------------------------------------------------------------
  // Public control methods
  // -----------------------------------------------------------------------

  /**
   * Start the BFS crawl. Resolves when the crawl is complete or stopped.
   */
  async start(): Promise<void> {
    if (this.status === 'running') return;

    this.status = 'running';
    this.startedAt = Date.now();
    this.abortController = new AbortController();

    this.log.info({ scanId: this.config.scanId, target: this.config.targetUrl }, 'Crawl starting');

    // Initialise subsystems
    this.dedup = new DedupStore(this.config.scanId, this.redis);
    this.robotsHandler = new RobotsHandler();
    this.queue = new AsyncQueue<string>();
    this.hostSemaphore = new HostSemaphore(this.config.maxConcurrencyPerHost);

    // ── Step 1: robots.txt ──────────────────────────────────────────────
    if (this.config.respectRobotsTxt) {
      await this.robotsHandler.load(this.config.targetUrl, this.config.userAgent);
      this.crawlDelayMs = this.robotsHandler.getCrawlDelay();
    }

    // ── Step 2: Seed queue ──────────────────────────────────────────────
    const seedUrl = normalizeUrl(this.config.targetUrl);
    this.enqueuedUrls.add(seedUrl);
    this.queue.enqueue(seedUrl);

    // Seed sitemap URLs asynchronously so crawling starts immediately without blocking
    const sitemapUrls = this.robotsHandler.getSitemapUrls();
    if (sitemapUrls.length > 0) {
      Promise.resolve().then(async () => {
        for (const smUrl of sitemapUrls) {
          if (this.status !== 'running') break;
          try {
            const urls = await fetchSitemapUrls(smUrl, this.config.userAgent);
            for (const u of urls) {
              const norm = normalizeUrl(u);
              if (
                isValidHttpUrl(norm) &&
                isSameOrigin(norm, seedUrl) &&
                !this.enqueuedUrls.has(norm) &&
                (!this.config.maxPages || this.enqueuedUrls.size < this.config.maxPages * 2)
              ) {
                this.enqueuedUrls.add(norm);
                this.queue.enqueue(norm);
              }
            }
          } catch {
            this.log.warn({ sitemapUrl: smUrl }, 'Failed to fetch sitemap');
          }
        }
      });
    }

    // ── Step 3: Progress ticker ─────────────────────────────────────────
    this.progressTimer = setInterval(() => {
      if (this.status === 'running') this.emitProgress();
    }, PROGRESS_INTERVAL_MS);

    // ── Step 4: Launch worker pool ──────────────────────────────────────
    const workerCount = this.config.maxConcurrency;
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(this.worker(i));
    }

    // Wait for all workers to drain
    await Promise.allSettled(workers);

    // ── Step 5: Cleanup ─────────────────────────────────────────────────
    this.stopProgressTimer();

    if (this.status === 'running') {
      this.status = 'completed';
      this.emitProgress();
      this.emit('complete', { scanId: this.config.scanId });
      this.log.info(
        {
          scanId: this.config.scanId,
          pagesScanned: this.pagesScanned,
          linksChecked: this.linksChecked,
          brokenLinks: this.brokenLinksFound,
        },
        'Crawl complete',
      );
    }

    await closeAllPools();
  }

  /** Pause the crawl. Workers will block until `resume()` is called. */
  pause(): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.pausePromise = new Promise<void>((resolve) => {
      this.pauseResolve = resolve;
    });
    this.emitProgress();
    this.log.info({ scanId: this.config.scanId }, 'Crawl paused');
  }

  /** Resume a paused crawl. */
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.pauseResolve?.();
    this.pausePromise = null;
    this.pauseResolve = null;
    this.emitProgress();
    this.log.info({ scanId: this.config.scanId }, 'Crawl resumed');
  }

  /** Stop the crawl permanently. In-flight requests are aborted. */
  stop(): void {
    this.log.info({ scanId: this.config.scanId }, 'Crawl stopped');
    this.status = 'completed';
    this.abortController.abort();
    this.queue.close();
    this.stopProgressTimer();

    // Unblock paused workers so they can exit
    this.pauseResolve?.();
    this.pausePromise = null;
    this.pauseResolve = null;

    this.emitProgress();
    this.emit('complete', { scanId: this.config.scanId });
  }

  // -----------------------------------------------------------------------
  // Worker loop
  // -----------------------------------------------------------------------

  /**
   * A single async worker: dequeues URLs, fetches pages, extracts and
   * checks links, and enqueues newly discovered internal URLs.
   */
  private async worker(_id: number): Promise<void> {
    while (!this.abortController.signal.aborted) {
      // Honour pause
      if (this.pausePromise) {
        await this.pausePromise;
      }

      // Check maxPages limit
      if (this.config.maxPages > 0 && this.pagesScanned >= this.config.maxPages) {
        break;
      }

      // Dequeue next URL (blocks until one is available or queue closes)
      const url = await this.queue.dequeue();
      if (url === null) break; // queue closed

      // Already visited?
      if (await this.dedup.has(url)) continue;
      await this.dedup.add(url);

      // Check abort again after the await
      if (this.abortController.signal.aborted) break;

      // Is this an internal URL?
      const internal = isSameOrigin(url, this.config.targetUrl);

      // Skip if robots.txt disallows it
      if (internal && this.config.respectRobotsTxt && !this.robotsHandler.isAllowed(url)) {
        continue;
      }

      // URL pattern trap detection
      const pattern = urlPatternKey(url);
      const patternCount = (this.urlPatternCounts.get(pattern) ?? 0) + 1;
      this.urlPatternCounts.set(pattern, patternCount);
      if (patternCount > URL_PATTERN_CAP) {
        this.log.debug({ pattern, url }, 'URL pattern cap reached — skipping');
        continue;
      }

      this.activeWorkers++;
      this.currentUrl = url;

      try {
        if (internal) {
          await this.processInternalPage(url);
        }
        // External URLs are only checked when discovered as links from
        // internal pages — they are not enqueued for crawling on their own.
      } catch (err) {
        this.log.error({ url, err }, 'Worker error processing page');
        this.emit('error', {
          scanId: this.config.scanId,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.activeWorkers--;
      }

      // If queue is empty and no workers are active, we're done
      if (this.queue.size === 0 && this.activeWorkers === 0) {
        // Give a brief moment for any in-flight enqueues to land
        await new Promise((r) => setTimeout(r, 50));
        if (this.queue.size === 0 && this.activeWorkers === 0) {
          this.queue.close();
          break;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Page processing
  // -----------------------------------------------------------------------

  /**
   * Fetch an internal page, extract links, check each link, emit results,
   * and enqueue newly discovered internal URLs.
   */
  private async processInternalPage(pageUrl: string): Promise<void> {
    const hostname = getHostname(pageUrl);

    // Per-host concurrency limiting for the page fetch
    await this.hostSemaphore.acquire(hostname);

    let fetchResult;
    try {
      // Respect crawl delay
      await this.applyCrawlDelay(hostname);

      // Fetch the page HTML
      fetchResult = await fetchPage(pageUrl, {
        timeout: this.config.requestTimeout,
        userAgent: this.config.userAgent,
        maxRedirects: this.config.maxRedirects,
      });

      this.lastRequestByHost.set(hostname, Date.now());
    } finally {
      this.hostSemaphore.release(hostname);
    }

    this.pagesScanned++;
    this.emit('page-scanned', { url: pageUrl, statusCode: fetchResult.statusCode });

    if (fetchResult.statusCode === 0 || !fetchResult.body) {
      return;
    }

    // Extract links from the HTML
    const links = extractLinks(fetchResult.body, pageUrl);

    // Check links in manageable batches of 15 to maintain smooth streaming without event loop congestion
    const BATCH_SIZE = 15;
    for (let i = 0; i < links.length; i += BATCH_SIZE) {
      if (this.abortController.signal.aborted) break;
      if (this.pausePromise) {
        await this.pausePromise;
      }
      if (this.abortController.signal.aborted) break;
      const batch = links.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map((link) => this.checkAndEmitLink(pageUrl, link)));
    }
  }

  /**
   * Check a single extracted link and emit a `link-result` event.
   * If the link is internal and not yet visited, enqueue it for crawling.
   */
  private async checkAndEmitLink(sourceUrl: string, link: ExtractedLink): Promise<void> {
    if (this.abortController.signal.aborted) return;

    const targetUrl = link.url;
    const internal = isSameOrigin(targetUrl, this.config.targetUrl);

    // Skip external links if the config says so
    if (!internal && !this.config.checkExternalLinks) return;

    // Build the base result
    const result: LinkResult = {
      scanId: this.config.scanId,
      sourceUrl,
      targetUrl,
      tagName: link.tagName,
      attribute: link.attribute,
      anchorText: link.anchorText,
      statusCode: null,
      errorType: 'none',
      errorMessage: '',
      responseTimeMs: 0,
      isInternal: internal,
      isBroken: false,
      redirectChain: [],
      timestamp: Date.now(),
    };

    // Global deduplication: check if targetUrl was already verified in this session
    const cached = this.verifiedTargetResults.get(targetUrl);
    if (cached) {
      result.statusCode = cached.statusCode;
      result.errorType = cached.errorType;
      result.errorMessage = cached.errorMessage;
      result.responseTimeMs = cached.responseTimeMs;
      result.redirectChain = cached.redirectChain;
      result.isBroken = cached.isBroken;
      this.emit('link-result', result);

      if (internal && !result.isBroken) {
        const norm = normalizeUrl(targetUrl);
        if (!this.enqueuedUrls.has(norm) && !(await this.dedup.has(norm))) {
          this.enqueuedUrls.add(norm);
          this.queue.enqueue(norm);
        }
      }
      return;
    }

    // In-flight deduplication: if this URL is already being checked right now, wait for it
    const inFlight = this.pendingChecks.get(targetUrl);
    if (inFlight) {
      const outcome = await inFlight;
      result.statusCode = outcome.statusCode;
      result.errorType = outcome.errorType;
      result.errorMessage = outcome.errorMessage;
      result.responseTimeMs = outcome.responseTimeMs;
      result.redirectChain = outcome.redirectChain;
      result.isBroken = outcome.isBroken;
      this.emit('link-result', result);
      return;
    }

    if (!isValidHttpUrl(targetUrl)) {
      result.errorType = 'invalid-url';
      result.errorMessage = 'Not a valid HTTP(S) URL';
      result.isBroken = true;
      this.linksChecked++;
      this.brokenLinksFound++;
      this.verifiedTargetResults.set(targetUrl, {
        statusCode: null,
        errorType: 'invalid-url',
        errorMessage: 'Not a valid HTTP(S) URL',
        responseTimeMs: 0,
        redirectChain: [],
        isBroken: true,
      });
      this.emit('link-result', result);
      return;
    }

    const checkPromise = (async () => {
      try {
        const hostname = getHostname(targetUrl);
        await this.hostSemaphore.acquire(hostname);

        try {
          await this.applyCrawlDelay(hostname);

          const check = await checkUrl(targetUrl, {
            timeout: this.config.requestTimeout,
            userAgent: this.config.userAgent,
            maxRedirects: this.config.maxRedirects,
          });

          this.lastRequestByHost.set(hostname, Date.now());

          const isBroken =
            check.errorType !== 'none' || (check.statusCode >= 400 && check.statusCode < 600);

          return {
            statusCode: check.statusCode || null,
            errorType: check.errorType as LinkResult['errorType'],
            errorMessage: check.errorMessage,
            responseTimeMs: check.responseTimeMs,
            redirectChain: check.redirectChain,
            isBroken,
          };
        } finally {
          this.hostSemaphore.release(hostname);
        }
      } catch (err) {
        return {
          statusCode: null,
          errorType: 'connection' as LinkResult['errorType'],
          errorMessage: err instanceof Error ? err.message : String(err),
          responseTimeMs: 0,
          redirectChain: [],
          isBroken: true,
        };
      }
    })();

    this.pendingChecks.set(targetUrl, checkPromise);
    const outcome = await checkPromise;
    this.pendingChecks.delete(targetUrl);

    result.statusCode = outcome.statusCode;
    result.errorType = outcome.errorType;
    result.errorMessage = outcome.errorMessage;
    result.responseTimeMs = outcome.responseTimeMs;
    result.redirectChain = outcome.redirectChain;
    result.isBroken = outcome.isBroken;

    this.linksChecked++;
    if (result.isBroken) this.brokenLinksFound++;

    // Cache the verification outcome globally
    this.verifiedTargetResults.set(targetUrl, outcome);
    this.emit('link-result', result);

    // Enqueue internal links for further crawling
    if (internal && !result.isBroken) {
      const norm = normalizeUrl(targetUrl);
      if (!this.enqueuedUrls.has(norm) && !(await this.dedup.has(norm))) {
        this.enqueuedUrls.add(norm);
        this.queue.enqueue(norm);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Crawl delay
  // -----------------------------------------------------------------------

  /**
   * If a crawl delay is configured (from robots.txt) and we've recently
   * hit this host, wait the appropriate amount of time.
   */
  private async applyCrawlDelay(hostname: string): Promise<void> {
    if (this.crawlDelayMs <= 0) return;

    const lastRequest = this.lastRequestByHost.get(hostname);
    if (!lastRequest) return;

    const elapsed = Date.now() - lastRequest;
    const remaining = this.crawlDelayMs - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  // -----------------------------------------------------------------------
  // Progress emission
  // -----------------------------------------------------------------------

  private emitProgress(): void {
    const now = Date.now();
    const elapsedMs = now - this.startedAt;
    const elapsedSec = elapsedMs / 1000;

    const progress: ScanProgress = {
      scanId: this.config.scanId,
      status: this.status === 'completed' ? 'completed' : this.status === 'paused' ? 'paused' : 'running',
      pagesScanned: this.pagesScanned,
      pagesQueued: this.queue.size,
      linksChecked: this.linksChecked,
      brokenLinksFound: this.brokenLinksFound,
      startedAt: this.startedAt,
      elapsedMs,
      currentUrl: this.currentUrl,
      pagesPerSecond: elapsedSec > 0 ? Math.round((this.pagesScanned / elapsedSec) * 100) / 100 : 0,
    };

    this.emit('progress', progress);
  }

  private stopProgressTimer(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }
}
