/**
 * ScanManager — Manages the lifecycle of crawl scans.
 *
 * Keeps active scans in memory and broadcasts events for real-time
 * streaming (SSE / WebSocket) consumers via an EventEmitter.
 */
import { EventEmitter } from 'node:events';
import { Crawler } from '@blc/crawler';
import type { ScanConfig, ScanProgress, LinkResult } from '@blc/crawler';
import { nanoid } from 'nanoid';
import { generateCsv } from './utils/csv-export.js';

import type { Redis } from 'ioredis';

/** Maximum number of OK (non-broken) link results kept per scan. */
const MAX_OK_RESULTS = 10_000;

/** Internal state for a single scan. */
export interface ScanState {
  scanId: string;
  crawler: Crawler;
  config: Partial<ScanConfig>;
  results: LinkResult[];
  okCount: number;
  progress: ScanProgress;
  createdAt: number;
}

/** Events emitted by ScanManager for streaming subscribers. */
export interface ScanManagerEvents {
  'scan:progress': { scanId: string; progress: ScanProgress };
  'scan:link-result': { scanId: string; result: LinkResult };
  'scan:complete': { scanId: string; progress: ScanProgress };
  'scan:error': { scanId: string; error: string };
}

export class ScanManager extends EventEmitter {
  private scans = new Map<string, ScanState>();
  private redis?: Redis;

  constructor(redis?: Redis) {
    super();
    this.redis = redis;
  }

  /** Create a new scan entry and return its ID. Does NOT start crawling. */
  createScan(userConfig: Partial<ScanConfig>): string {
    const scanId = nanoid(12);

    const crawlerConfig: Partial<ScanConfig> & { scanId: string; targetUrl: string } = {
      scanId,
      targetUrl: userConfig.targetUrl ?? '',
      ...userConfig,
    };

    const crawler = new Crawler(crawlerConfig as ScanConfig, this.redis);

    const initialProgress: ScanProgress = {
      scanId,
      status: 'running',
      pagesScanned: 0,
      pagesQueued: 0,
      linksChecked: 0,
      brokenLinksFound: 0,
      startedAt: Date.now(),
      elapsedMs: 0,
      currentUrl: '',
      pagesPerSecond: 0,
    };

    this.scans.set(scanId, {
      scanId,
      crawler,
      config: userConfig,
      results: [],
      okCount: 0,
      progress: initialProgress,
      createdAt: Date.now(),
    });

    return scanId;
  }

  /** Start crawling for the given scan. Wires up all event listeners. */
  startScan(scanId: string): void {
    const state = this.requireScan(scanId);

    state.crawler.on('progress', (progress: ScanProgress) => {
      state.progress = progress;
      this.emit('scan:progress', { scanId, progress });
    });

    state.crawler.on('link-result', (result: LinkResult) => {
      if (result.isBroken) {
        // Always keep broken links
        state.results.push(result);
      } else {
        // Sample OK links: keep first MAX_OK_RESULTS
        if (state.okCount < MAX_OK_RESULTS) {
          state.results.push(result);
        }
        state.okCount++;
      }
      this.emit('scan:link-result', { scanId, result });
    });

    state.crawler.on('complete', () => {
      state.progress = { ...state.progress, status: 'completed' };
      this.emit('scan:complete', { scanId, progress: state.progress });
    });

    state.crawler.on('error', (error: Error) => {
      state.progress = { ...state.progress, status: 'error' };
      this.emit('scan:error', { scanId, error: error.message });
    });

    state.crawler.start();
  }

  /** Get the state for a scan or undefined if not found. */
  getScan(scanId: string): ScanState | undefined {
    return this.scans.get(scanId);
  }

  /** List all scans with their current summary. */
  listScans(): Array<{
    scanId: string;
    url: string;
    status: ScanProgress['status'];
    pagesScanned: number;
    linksChecked: number;
    brokenLinksFound: number;
    startedAt: number;
    elapsedMs: number;
    createdAt: number;
  }> {
    return Array.from(this.scans.values()).map((s) => ({
      scanId: s.scanId,
      url: s.config.targetUrl || s.progress.currentUrl || '',
      status: s.progress.status,
      pagesScanned: s.progress.pagesScanned,
      linksChecked: s.progress.linksChecked,
      brokenLinksFound: s.progress.brokenLinksFound,
      startedAt: s.progress.startedAt,
      elapsedMs: s.progress.elapsedMs,
      createdAt: s.createdAt,
    }));
  }

  /** Pause a running scan. */
  pauseScan(scanId: string): void {
    const state = this.requireScan(scanId);
    state.crawler.pause();
    state.progress = { ...state.progress, status: 'paused' };
    this.emit('scan:progress', { scanId, progress: state.progress });
  }

  /** Resume a paused scan. */
  resumeScan(scanId: string): void {
    const state = this.requireScan(scanId);
    state.crawler.resume();
    state.progress = { ...state.progress, status: 'running' };
    this.emit('scan:progress', { scanId, progress: state.progress });
  }

  /** Stop and remove a scan. */
  stopScan(scanId: string): void {
    const state = this.requireScan(scanId);
    state.crawler.stop();
    state.progress = { ...state.progress, status: 'completed' };
    this.emit('scan:complete', { scanId, progress: state.progress });
  }

  /** Remove a scan from memory entirely. */
  removeScan(scanId: string): void {
    const state = this.scans.get(scanId);
    if (state) {
      try {
        state.crawler.stop();
      } catch {
        // Ignore — may already be stopped
      }
      this.scans.delete(scanId);
    }
  }

  /** Return filtered results for a scan. */
  getResults(
    scanId: string,
    filters?: { broken?: boolean; statusCode?: number; errorType?: string },
  ): LinkResult[] {
    const state = this.requireScan(scanId);
    let results = state.results;

    if (filters) {
      if (filters.broken !== undefined) {
        results = results.filter((r) => r.isBroken === filters.broken);
      }
      if (filters.statusCode !== undefined) {
        results = results.filter((r) => r.statusCode === filters.statusCode);
      }
      if (filters.errorType !== undefined && filters.errorType !== 'all') {
        const targetType = filters.errorType;
        results = results.filter((r) => {
          if (targetType === '404') {
            return r.statusCode === 404;
          }
          if (targetType === 'http-error') {
            return (
              r.errorType === 'http-error' ||
              (r.statusCode !== null && r.statusCode >= 400 && r.statusCode < 600)
            );
          }
          if (targetType === 'timeout') {
            return Boolean(r.errorType && r.errorType.includes('timeout'));
          }
          if (targetType === 'dns') {
            return Boolean(r.errorType && r.errorType.includes('dns'));
          }
          if (targetType === 'ssl') {
            return Boolean(r.errorType && r.errorType.includes('ssl'));
          }
          if (targetType === 'redirect-loop') {
            return Boolean(r.errorType && r.errorType.includes('redirect'));
          }
          if (targetType === 'connection') {
            return Boolean(r.errorType && r.errorType.includes('connection'));
          }
          return r.errorType === targetType;
        });
      }
    }

    return results;
  }

  /** Export scan results as CSV with optional filters. */
  exportCsv(
    scanId: string,
    filters?: { broken?: boolean; statusCode?: number; errorType?: string },
  ): string {
    const results = this.getResults(scanId, filters);
    return generateCsv(results);
  }

  /** Export scan results as JSON with optional filters. */
  exportJson(
    scanId: string,
    filters?: { broken?: boolean; statusCode?: number; errorType?: string },
  ): string {
    const results = this.getResults(scanId, filters);
    return JSON.stringify(results, null, 2);
  }

  /** Get a scan or throw a descriptive error. */
  private requireScan(scanId: string): ScanState {
    const state = this.scans.get(scanId);
    if (!state) {
      throw new ScanNotFoundError(scanId);
    }
    return state;
  }
}

/** Custom error for missing scans. */
export class ScanNotFoundError extends Error {
  public readonly scanId: string;
  constructor(scanId: string) {
    super(`Scan not found: ${scanId}`);
    this.name = 'ScanNotFoundError';
    this.scanId = scanId;
  }
}
