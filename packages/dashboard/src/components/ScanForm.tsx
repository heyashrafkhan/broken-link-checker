import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, Settings2, Loader2 } from 'lucide-react';
import type { ScanConfig } from '../types';

interface ScanFormProps {
  onStartScan: (url: string, options?: Partial<ScanConfig>) => Promise<void>;
}

export const ScanForm: React.FC<ScanFormProps> = ({ onStartScan }) => {
  const [url, setUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maxConcurrency, setMaxConcurrency] = useState(30);
  const [requestTimeout, setRequestTimeout] = useState(10000);
  const [checkExternalLinks, setCheckExternalLinks] = useState(true);
  const [respectRobotsTxt, setRespectRobotsTxt] = useState(true);

  const validateUrl = (value: string): boolean => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError('Please enter a URL');
      return;
    }
    if (!validateUrl(trimmed)) {
      setError('URL must start with http:// or https://');
      return;
    }

    setIsLoading(true);
    try {
      await onStartScan(trimmed, {
        maxConcurrency,
        requestTimeout,
        checkExternalLinks,
        respectRobotsTxt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm dark:shadow-none animate-fade-in transition-colors">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com"
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono text-sm transition-all shadow-sm"
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting…
              </>
            ) : (
              'Start Scan'
            )}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400 animate-fade-in font-medium">{error}</p>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Advanced Options
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAdvanced && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700/50 animate-slide-up transition-colors">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5 font-medium">
                Max Concurrency: <span className="text-gray-900 dark:text-white font-mono font-semibold">{maxConcurrency}</span>
              </label>
              <input
                type="range"
                min={1}
                max={100}
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-brand-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                <span>1</span>
                <span>100</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5 font-medium">
                Request Timeout (ms)
              </label>
              <input
                type="number"
                value={requestTimeout}
                onChange={(e) => setRequestTimeout(Number(e.target.value))}
                min={1000}
                max={60000}
                step={1000}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkExternalLinks}
                onChange={(e) => setCheckExternalLinks(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Check external links</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={respectRobotsTxt}
                onChange={(e) => setRespectRobotsTxt(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-brand-600 focus:ring-brand-500 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Respect robots.txt</span>
            </label>
          </div>
        )}
      </form>
    </div>
  );
};
