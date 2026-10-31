export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function truncateUrl(url: string, maxLen: number): string {
  if (url.length <= maxLen) return url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    if (path.length <= maxLen) return path;
    return path.slice(0, maxLen - 1) + '…';
  } catch {
    return url.slice(0, maxLen - 1) + '…';
  }
}

export function getStatusColor(code: number | null): string {
  if (code === null) return 'text-gray-500 dark:text-gray-400';
  if (code >= 200 && code < 300) return 'text-emerald-600 dark:text-emerald-400';
  if (code >= 300 && code < 400) return 'text-amber-600 dark:text-yellow-400';
  if (code >= 400 && code < 500) return 'text-red-600 dark:text-red-400';
  if (code >= 500) return 'text-red-700 dark:text-red-500';
  return 'text-gray-500 dark:text-gray-400';
}

export function getStatusBg(code: number | null): string {
  if (code === null) return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  if (code >= 200 && code < 300) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400';
  if (code >= 300 && code < 400) return 'bg-amber-100 text-amber-800 dark:bg-yellow-950 dark:text-yellow-400';
  if (code >= 400 && code < 500) return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400';
  if (code >= 500) return 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-500';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
}

export function getErrorTypeBadgeColor(errorType: string | null): string {
  switch (errorType) {
    case 'http-error':
      return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800';
    case 'dns':
    case 'dns-error':
      return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-800';
    case 'timeout':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800';
    case 'connection':
    case 'connection-refused':
      return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800';
    case 'ssl':
    case 'ssl-error':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800';
    case 'redirect-loop':
    case 'too-many-redirects':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
}
