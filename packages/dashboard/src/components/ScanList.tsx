import React from 'react';
import { Trash2, Clock, Globe, AlertTriangle } from 'lucide-react';
import type { ScanSummary } from '../types';
import { formatDuration, formatNumber } from '../utils/format';

interface ScanListProps {
  scans: ScanSummary[];
  onSelectScan: (scanId: string) => void;
  onDeleteScan: (scanId: string) => void;
  activeScanId: string | null;
}

export const ScanList: React.FC<ScanListProps> = ({
  scans,
  onSelectScan,
  onDeleteScan,
  activeScanId,
}) => {
  const safeScans = Array.isArray(scans) ? scans : [];

  if (safeScans.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center text-gray-400 dark:text-gray-500 shadow-sm dark:shadow-none transition-colors">
        <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-400">No previous scans found.</p>
        <p className="text-xs text-gray-500 dark:text-gray-600 mt-1">Start a new scan above to see live progress.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm dark:shadow-none transition-colors">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-300 mb-3 px-2">Recent Scans</h3>
      <div className="space-y-2">
        {safeScans.map((scan) => {
          const isSelected = scan.scanId === activeScanId;
          const isRunning = scan.status === 'running';

          return (
            <div
              key={scan.scanId}
              onClick={() => onSelectScan(scan.scanId)}
              className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-brand-50/80 dark:bg-brand-950/40 border-brand-300 dark:border-brand-700/60 shadow-sm'
                  : 'bg-gray-50 dark:bg-gray-950/50 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isRunning
                      ? 'bg-emerald-500 animate-ping'
                      : scan.status === 'paused'
                      ? 'bg-amber-400'
                      : 'bg-gray-400 dark:bg-gray-600'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-900 dark:text-gray-200 truncate font-semibold">
                      {scan.url}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                        isRunning
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
                          : scan.status === 'completed'
                          ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800'
                          : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                      }`}
                    >
                      {scan.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    <span>{formatNumber(scan.pagesScanned)} pages</span>
                    <span>{formatNumber(scan.linksChecked)} links</span>
                    <span
                      className={
                        scan.brokenLinksFound > 0 ? 'text-red-600 dark:text-red-400 font-semibold flex items-center gap-1' : ''
                      }
                    >
                      {scan.brokenLinksFound > 0 && <AlertTriangle className="w-3 h-3" />}
                      {formatNumber(scan.brokenLinksFound)} broken
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(scan.elapsedMs)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onDeleteScan(scan.scanId)}
                  className="p-1.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  title="Delete scan"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
