import React, { useState, useMemo } from 'react';
import {
  FileText,
  Link2,
  AlertTriangle,
  Layers,
  Zap,
  Clock,
  ArrowLeft,
  Pause,
  Play,
  Square,
  Globe,
} from 'lucide-react';
import { StatsCard } from './StatsCard';
import { FilterBar } from './FilterBar';
import { ResultsTable } from './ResultsTable';
import { useScanStream } from '../hooks/useSSE';
import { pauseScan, resumeScan, stopScan } from '../api';
import { formatDuration } from '../utils/format';

interface ScanDetailProps {
  scanId: string;
  onBack: () => void;
}

export const ScanDetail: React.FC<ScanDetailProps> = ({ scanId, onBack }) => {
  const { progress, results } = useScanStream(scanId);

  const [brokenOnly, setBrokenOnly] = useState(false);
  const [selectedErrorType, setSelectedErrorType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  // Synchronize local status with incoming progress updates if available
  const effectiveStatus = localStatus ?? progress?.status ?? 'running';
  const isScanning = effectiveStatus === 'running';
  const isPaused = effectiveStatus === 'paused';
  const isStopped = effectiveStatus === 'completed';

  const handlePause = async () => {
    setLocalStatus('paused');
    setActionLoading(true);
    try {
      await pauseScan(scanId);
    } catch (err) {
      console.error('Failed to pause scan:', err);
      setLocalStatus(progress?.status ?? null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setLocalStatus('running');
    setActionLoading(true);
    try {
      await resumeScan(scanId);
    } catch (err) {
      console.error('Failed to resume scan:', err);
      setLocalStatus(progress?.status ?? null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setLocalStatus('completed');
    setActionLoading(true);
    try {
      await stopScan(scanId);
    } catch (err) {
      console.error('Failed to stop scan:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Filter results based on user selection
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (brokenOnly && !item.isBroken) {
        return false;
      }

      if (selectedErrorType !== 'all') {
        if (selectedErrorType === 'http-error') {
          const isHttp =
            item.errorType === 'http-error' ||
            (item.statusCode !== null && item.statusCode >= 400 && item.statusCode < 600);
          if (!isHttp) return false;
        } else if (selectedErrorType === 'timeout') {
          if (!item.errorType || !item.errorType.includes('timeout')) return false;
        } else if (selectedErrorType === 'dns') {
          if (!item.errorType || !item.errorType.includes('dns')) return false;
        } else if (selectedErrorType === 'ssl') {
          if (!item.errorType || !item.errorType.includes('ssl')) return false;
        } else if (selectedErrorType === 'redirect-loop') {
          if (!item.errorType || !item.errorType.includes('redirect')) return false;
        } else if (selectedErrorType === 'connection') {
          if (!item.errorType || !item.errorType.includes('connection')) return false;
        } else if (item.errorType !== selectedErrorType) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTarget = item.targetUrl.toLowerCase().includes(query);
        const matchesSource = item.sourceUrl.toLowerCase().includes(query);
        const matchesAnchor = (item.anchorText || '').toLowerCase().includes(query);
        if (!matchesTarget && !matchesSource && !matchesAnchor) {
          return false;
        }
      }

      return true;
    });
  }, [results, brokenOnly, selectedErrorType, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm dark:shadow-none transition-colors">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            title="Back to scan list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <h2 className="font-mono text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[320px] sm:max-w-md">
                {progress?.currentUrl || `Scan: ${scanId}`}
              </h2>
              {isScanning && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
              {isPaused && (
                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide bg-amber-100 text-amber-800 border border-amber-300 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800">
                  Paused
                </span>
              )}
              {isStopped && (
                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wide bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800">
                  Completed
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              ID: <span className="font-mono font-medium">{scanId}</span>
            </p>
          </div>
        </div>

        {/* Scan Actions */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {isScanning && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handlePause}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-yellow-600/20 dark:hover:bg-yellow-600/30 dark:text-yellow-300 dark:border-yellow-700/50 rounded-lg text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleResume}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 dark:text-emerald-300 dark:border-emerald-700/50 rounded-lg text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Resume
            </button>
          )}

          {(isScanning || isPaused) && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-800 border border-red-300 dark:bg-red-600/20 dark:hover:bg-red-600/30 dark:text-red-300 dark:border-red-700/50 rounded-lg text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* 6 Metric Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatsCard
          icon={FileText}
          label="Pages Scanned"
          value={progress?.pagesScanned ?? 0}
          color="blue"
        />
        <StatsCard
          icon={Link2}
          label="Links Checked"
          value={progress?.linksChecked ?? 0}
          color="default"
        />
        <StatsCard
          icon={AlertTriangle}
          label="Broken Links"
          value={progress?.brokenLinksFound ?? 0}
          color={progress && progress.brokenLinksFound > 0 ? 'red' : 'default'}
        />
        <StatsCard
          icon={Layers}
          label="Queue Size"
          value={progress?.pagesQueued ?? 0}
          color="yellow"
        />
        <StatsCard
          icon={Zap}
          label="Speed"
          value={progress?.pagesPerSecond ?? 0}
          suffix="/s"
          color="green"
        />
        <StatsCard
          icon={Clock}
          label="Elapsed Time"
          value={formatDuration(progress?.elapsedMs ?? 0)}
          color="default"
        />
      </div>

      {/* Filter and Table Container */}
      <div>
        <FilterBar
          scanId={scanId}
          brokenOnly={brokenOnly}
          onBrokenOnlyChange={setBrokenOnly}
          selectedErrorType={selectedErrorType}
          onErrorTypeChange={setSelectedErrorType}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          totalFiltered={filteredResults.length}
          filteredResults={filteredResults}
        />
        <ResultsTable results={filteredResults} isScanning={Boolean(isScanning)} />
      </div>
    </div>
  );
};
