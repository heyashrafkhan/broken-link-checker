import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScanProgress, LinkResult } from '../types';

interface UseScanStreamReturn {
  progress: ScanProgress | null;
  results: LinkResult[];
  isConnected: boolean;
}

export function useScanStream(scanId: string | null): UseScanStreamReturn {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<LinkResult[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const resultsRef = useRef<LinkResult[]>([]);
  const seenKeysRef = useRef<Set<string>>(new Set());

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!scanId) {
      cleanup();
      setProgress(null);
      setResults([]);
      resultsRef.current = [];
      seenKeysRef.current.clear();
      return;
    }

    // Reset state for new scanId
    resultsRef.current = [];
    seenKeysRef.current.clear();
    setResults([]);

    // 1. Fetch initial progress
    fetch(`/api/scans/${scanId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((prog) => {
        if (prog) setProgress(prog);
      })
      .catch(() => {});

    // 2. Fetch existing results if scan is already running or completed
    fetch(`/api/scans/${scanId}/results?limit=50000`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.results)) {
          const list: LinkResult[] = data.results;
          for (const item of list) {
            seenKeysRef.current.add(`${item.sourceUrl}::${item.targetUrl}::${item.tagName}`);
          }
          resultsRef.current = list;
          setResults(list);
        }
      })
      .catch((err) => console.warn('Failed to load initial scan results:', err));

    // 3. Connect to live stream for real-time updates
    const es = new EventSource(`/api/scans/${scanId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.addEventListener('progress', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as ScanProgress;
        setProgress(data);
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('link-result', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as LinkResult;
        const key = `${data.sourceUrl}::${data.targetUrl}::${data.tagName}`;
        if (!seenKeysRef.current.has(key)) {
          seenKeysRef.current.add(key);
          resultsRef.current = [...resultsRef.current, data];
          setResults(resultsRef.current);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('complete', () => {
      cleanup();
    });

    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      cleanup();
    };
  }, [scanId, cleanup]);

  return { progress, results, isConnected };
}
