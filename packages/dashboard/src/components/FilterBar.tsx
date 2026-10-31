import React from 'react';
import { Search, Download, Filter } from 'lucide-react';
import type { LinkResult } from '../types';
import { exportResultsToCsv, exportResultsToJson } from '../utils/export';

interface FilterBarProps {
  scanId: string;
  brokenOnly: boolean;
  onBrokenOnlyChange: (val: boolean) => void;
  selectedErrorType: string;
  onErrorTypeChange: (val: string) => void;
  searchQuery: string;
  onSearchQueryChange: (val: string) => void;
  totalFiltered: number;
  filteredResults: LinkResult[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
  scanId,
  brokenOnly,
  onBrokenOnlyChange,
  selectedErrorType,
  onErrorTypeChange,
  searchQuery,
  onSearchQueryChange,
  totalFiltered,
  filteredResults,
}) => {
  const getFilterDescription = () => {
    if (selectedErrorType !== 'all') {
      const names: Record<string, string> = {
        'http-error': 'HTTP Errors (4xx/5xx)',
        'timeout': 'Timeouts',
        'dns': 'DNS Errors',
        'ssl': 'SSL Errors',
        'redirect-loop': 'Redirect Loops',
        'connection': 'Connection Errors',
      };
      return names[selectedErrorType] || selectedErrorType;
    }
    if (brokenOnly) {
      return 'Broken Only';
    }
    if (searchQuery.trim()) {
      return `"${searchQuery}"`;
    }
    return 'All Results';
  };

  const getExportFilename = (ext: 'csv' | 'json') => {
    let suffix = '';
    if (selectedErrorType !== 'all') {
      suffix += `-${selectedErrorType}`;
    } else if (brokenOnly) {
      suffix += '-broken';
    } else {
      suffix += '-all';
    }
    if (searchQuery.trim()) {
      suffix += '-filtered';
    }
    return `scan-${scanId}${suffix}.${ext}`;
  };

  const handleExportCsv = () => {
    exportResultsToCsv(filteredResults, getExportFilename('csv'));
  };

  const handleExportJson = () => {
    exportResultsToJson(filteredResults, getExportFilename('json'));
  };

  const filterDesc = getFilterDescription();
  const hasResults = filteredResults.length > 0;

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/70 px-4 rounded-t-xl transition-colors">
      {/* Left side: broken filter toggles & search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => onBrokenOnlyChange(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              !brokenOnly
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            All Results
          </button>
          <button
            type="button"
            onClick={() => onBrokenOnlyChange(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              brokenOnly
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Broken Only
          </button>
        </div>

        {/* Error type dropdown */}
        <div className="relative">
          <select
            value={selectedErrorType}
            onChange={(e) => onErrorTypeChange(e.target.value)}
            className={`pl-3 pr-8 py-1.5 border rounded-lg text-xs appearance-none cursor-pointer shadow-sm transition-colors ${
              selectedErrorType !== 'all'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200'
            }`}
          >
            <option value="all">All Error Types</option>
            <option value="http-error">HTTP Errors (4xx/5xx)</option>
            <option value="timeout">Timeouts</option>
            <option value="dns">DNS Resolution</option>
            <option value="ssl">SSL / TLS</option>
            <option value="redirect-loop">Redirect Loops</option>
            <option value="connection">Connection Refused</option>
          </select>
          <Filter className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Search input */}
        <div className="relative min-w-[200px] flex-1 sm:flex-initial">
          <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Filter by URL or anchor..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-sm transition-colors"
          />
        </div>

        <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline ml-2 font-medium">
          {totalFiltered.toLocaleString()} results
        </span>
      </div>

      {/* Right side: Explicit Filtered Exports */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!hasResults}
          title={`Export ${filteredResults.length} records (${filterDesc}) as CSV`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          <span>Export CSV</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-800">
            {filterDesc}: {filteredResults.length}
          </span>
        </button>

        <button
          type="button"
          onClick={handleExportJson}
          disabled={!hasResults}
          title={`Export ${filteredResults.length} records (${filterDesc}) as JSON`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          <span>Export JSON</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/60 dark:text-brand-300 dark:border-brand-800">
            {filterDesc}: {filteredResults.length}
          </span>
        </button>
      </div>
    </div>
  );
};
