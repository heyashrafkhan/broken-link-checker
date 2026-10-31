import type { LinkResult } from '../types';

const CSV_COLUMNS = [
  'Source Page',
  'Target URL',
  'Tag',
  'Anchor Text',
  'Status Code',
  'Error Type',
  'Error Message',
  'Response Time (ms)',
  'Is Internal',
  'Is Broken',
];

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportResultsToCsv(results: LinkResult[], filename: string) {
  const header = CSV_COLUMNS.map(escapeCsvValue).join(',');
  const rows = results.map((r) =>
    [
      escapeCsvValue(r.sourceUrl),
      escapeCsvValue(r.targetUrl),
      escapeCsvValue(r.tagName),
      escapeCsvValue(r.anchorText),
      escapeCsvValue(r.statusCode !== null ? r.statusCode : ''),
      escapeCsvValue(r.errorType),
      escapeCsvValue(r.errorMessage),
      escapeCsvValue(r.responseTimeMs),
      escapeCsvValue(r.isInternal ? 'true' : 'false'),
      escapeCsvValue(r.isBroken ? 'true' : 'false'),
    ].join(','),
  );

  const csvContent = [header, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function exportResultsToJson(results: LinkResult[], filename: string) {
  const jsonContent = JSON.stringify(results, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
