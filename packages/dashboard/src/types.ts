export interface ScanConfig {
  maxConcurrency: number;
  requestTimeout: number;
  checkExternalLinks: boolean;
  respectRobotsTxt: boolean;
}

export interface ScanProgress {
  scanId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  pagesScanned: number;
  pagesQueued: number;
  linksChecked: number;
  brokenLinksFound: number;
  startedAt: number;
  elapsedMs: number;
  currentUrl: string;
  pagesPerSecond: number;
}

export interface LinkResult {
  scanId: string;
  sourceUrl: string;
  targetUrl: string;
  tagName: string;
  attribute: string;
  anchorText: string;
  statusCode: number | null;
  errorType: string | null;
  errorMessage: string | null;
  responseTimeMs: number | null;
  isInternal: boolean;
  isBroken: boolean;
  redirectChain: string[];
  timestamp: number;
}

export interface ScanSummary {
  scanId: string;
  url: string;
  status: ScanProgress['status'];
  pagesScanned: number;
  linksChecked: number;
  brokenLinksFound: number;
  startedAt: number;
  elapsedMs: number;
}

export interface ResultsParams {
  broken?: boolean;
  page?: number;
  limit?: number;
}

export type ErrorType =
  | 'http-error'
  | 'dns-error'
  | 'timeout'
  | 'connection-refused'
  | 'ssl-error'
  | 'too-many-redirects'
  | 'unknown';
