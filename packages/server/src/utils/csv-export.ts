/**
 * CSV generation utility for scan results.
 */
import type { LinkResult } from '@blc/crawler';

const COLUMNS = [
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
] as const;

/**
 * Escape a value for CSV.
 * Wraps in double quotes if the value contains a comma, double-quote, or newline.
 * Any internal double-quotes are doubled.
 */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate a CSV string from an array of LinkResult objects.
 */
export function generateCsv(results: LinkResult[]): string {
  const header = COLUMNS.map(escapeCsvValue).join(',');

  const rows = results.map((r) => {
    const values = [
      r.sourceUrl,
      r.targetUrl,
      r.tagName,
      r.anchorText,
      r.statusCode !== null ? String(r.statusCode) : '',
      r.errorType,
      r.errorMessage,
      String(r.responseTimeMs),
      r.isInternal ? 'true' : 'false',
      r.isBroken ? 'true' : 'false',
    ];
    return values.map(escapeCsvValue).join(',');
  });

  return [header, ...rows].join('\n');
}
