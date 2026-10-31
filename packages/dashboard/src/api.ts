import type { ScanConfig, ScanSummary, ScanProgress, LinkResult, ResultsParams } from './types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  const text = await res.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export async function startScan(
  url: string,
  options?: Partial<ScanConfig>,
): Promise<{ scanId: string }> {
  return request<{ scanId: string }>(`${BASE}/scans`, {
    method: 'POST',
    body: JSON.stringify({ url, options }),
  });
}

export async function getScans(): Promise<ScanSummary[]> {
  try {
    const data = await request<ScanSummary[] | { scans: ScanSummary[] }>(`${BASE}/scans`);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && Array.isArray((data as any).scans)) {
      return (data as any).scans;
    }
    return [];
  } catch (err) {
    console.warn('Failed to fetch scans:', err);
    return [];
  }
}

export async function getScanProgress(scanId: string): Promise<ScanProgress> {
  return request<ScanProgress>(`${BASE}/scans/${scanId}`);
}

export async function getResults(
  scanId: string,
  params: ResultsParams,
): Promise<{ results: LinkResult[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.broken !== undefined) searchParams.set('broken', String(params.broken));
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return request<{ results: LinkResult[]; total: number }>(
    `${BASE}/scans/${scanId}/results${qs ? `?${qs}` : ''}`,
  );
}

export async function pauseScan(scanId: string): Promise<void> {
  await request(`${BASE}/scans/${scanId}/pause`, { method: 'POST' });
}

export async function resumeScan(scanId: string): Promise<void> {
  await request(`${BASE}/scans/${scanId}/resume`, { method: 'POST' });
}

export async function stopScan(scanId: string): Promise<void> {
  await request(`${BASE}/scans/${scanId}/stop`, { method: 'POST' });
}

export async function deleteScan(scanId: string): Promise<void> {
  await request(`${BASE}/scans/${scanId}`, { method: 'DELETE' });
}

export function getExportUrl(scanId: string, format: 'csv' | 'json'): string {
  return `${BASE}/scans/${scanId}/export/${format}`;
}
