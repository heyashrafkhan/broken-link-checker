import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ScanForm } from './components/ScanForm';
import { ScanList } from './components/ScanList';
import { ScanDetail } from './components/ScanDetail';
import { startScan, getScans, deleteScan } from './api';
import type { ScanConfig, ScanSummary } from './types';

export const App: React.FC = () => {
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanSummary[]>([]);

  const fetchScans = useCallback(async () => {
    try {
      const data = await getScans();
      setScans(data);
    } catch {
      // ignore poll errors
    }
  }, []);

  useEffect(() => {
    fetchScans();
    const interval = setInterval(fetchScans, 3000);
    return () => clearInterval(interval);
  }, [fetchScans]);

  const handleStartScan = async (url: string, options?: Partial<ScanConfig>) => {
    const res = await startScan(url, options);
    setActiveScanId(res.scanId);
    fetchScans();
  };

  const handleDeleteScan = async (scanId: string) => {
    try {
      await deleteScan(scanId);
      if (activeScanId === scanId) {
        setActiveScanId(null);
      }
      fetchScans();
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex flex-col transition-colors">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeScanId ? (
          <ScanDetail scanId={activeScanId} onBack={() => setActiveScanId(null)} />
        ) : (
          <div className="space-y-8">
            {/* Hero / Form Section */}
            <div className="max-w-2xl mx-auto text-center space-y-2 mb-6">
              <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-gray-950 via-gray-800 to-gray-600 dark:from-white dark:via-gray-200 dark:to-gray-400 bg-clip-text text-transparent">
                Unlimited Broken Link Scanner
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Recursively crawls entire domains without artificial limits. Fast HEAD-then-GET probes,
                deduplication across millions of URLs, and real-time streaming diagnostics.
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              <ScanForm onStartScan={handleStartScan} />
            </div>

            {/* Recent Scans List */}
            <div className="max-w-4xl mx-auto">
              <ScanList
                scans={scans}
                onSelectScan={setActiveScanId}
                onDeleteScan={handleDeleteScan}
                activeScanId={activeScanId}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-900 py-6 text-center text-xs text-gray-500 dark:text-gray-600 transition-colors">
        High-Performance Broken Link Scanner • Enterprise Edition
      </footer>
    </div>
  );
};
