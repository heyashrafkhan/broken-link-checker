import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { StatusBadge } from './StatusBadge';
import { ExternalLink, Tag, Copy, Check } from 'lucide-react';
import type { LinkResult } from '../types';
import { truncateUrl } from '../utils/format';

interface ResultsTableProps {
  results: LinkResult[];
  isScanning: boolean;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ results, isScanning }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 15,
  });

  const handleCopyAnchor = async (text: string, index: number) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex((curr) => (curr === index ? null : curr));
      }, 1500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-b-xl overflow-hidden shadow-xl transition-colors">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-950/80 border-b border-gray-200 dark:border-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none transition-colors">
        <div className="col-span-3">Source Page</div>
        <div className="col-span-4">Target Link</div>
        <div className="col-span-2">Anchor / Alt</div>
        <div className="col-span-1 text-center">Status</div>
        <div className="col-span-1 text-center">Tag</div>
        <div className="col-span-1 text-right">Latency</div>
      </div>

      {/* Virtualized Body */}
      <div
        ref={parentRef}
        className="overflow-auto max-h-[600px] divide-y divide-gray-100 dark:divide-gray-800/60 relative"
      >
        {results.length === 0 ? (
          <div className="py-20 text-center text-gray-400 dark:text-gray-500 text-sm">
            {isScanning ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span>Scanning pages and verifying links...</span>
              </div>
            ) : (
              <span>No links match the selected filter.</span>
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = results[virtualRow.index];
              const isBroken = item.isBroken;
              const hasAnchor = Boolean(item.anchorText && item.anchorText.trim().length > 0);
              const isCopied = copiedIndex === virtualRow.index;

              return (
                <div
                  key={virtualRow.index}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={`grid grid-cols-12 gap-3 px-4 py-2.5 items-center text-xs font-mono transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 absolute top-0 left-0 w-full ${
                    isBroken
                      ? 'bg-red-50/60 text-red-900 dark:bg-red-950/20 dark:text-red-200 border-l-2 border-l-red-500'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {/* Source Page URL */}
                  <div className="col-span-3 truncate text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1"
                      title={item.sourceUrl}
                    >
                      <span className="truncate">{truncateUrl(item.sourceUrl, 38)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-40 hover:opacity-100" />
                    </a>
                  </div>

                  {/* Target URL */}
                  <div className="col-span-4 truncate">
                    <a
                      href={item.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`hover:underline flex items-center gap-1 font-medium ${
                        isBroken
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-brand-600 dark:text-blue-400'
                      }`}
                      title={item.targetUrl}
                    >
                      <span className="truncate">{truncateUrl(item.targetUrl, 50)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-40 hover:opacity-100" />
                    </a>
                  </div>

                  {/* Anchor / Alt Tag with Copy Option */}
                  <div
                    className="col-span-2 flex items-center justify-between gap-1 group/anchor text-gray-600 dark:text-gray-400 min-w-0"
                    title={item.anchorText || '-'}
                  >
                    {hasAnchor ? (
                      <>
                        <span className="truncate font-sans text-gray-800 dark:text-gray-200">
                          {item.anchorText}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyAnchor(item.anchorText, virtualRow.index)}
                          className="opacity-0 group-hover/anchor:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-all flex-shrink-0"
                          title={isCopied ? 'Copied to clipboard!' : 'Copy anchor / alt text'}
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600 italic">None</span>
                    )}
                  </div>

                  {/* Status / Error Badge */}
                  <div className="col-span-1 text-center">
                    <StatusBadge statusCode={item.statusCode} errorType={item.errorType} />
                  </div>

                  {/* HTML Tag Type */}
                  <div className="col-span-1 text-center">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] font-sans border border-gray-200 dark:border-gray-700">
                      <Tag className="w-2.5 h-2.5 mr-0.5" />
                      &lt;{item.tagName}&gt;
                    </span>
                  </div>

                  {/* Latency */}
                  <div className="col-span-1 text-right text-gray-500 dark:text-gray-400 font-mono">
                    {item.responseTimeMs !== null && item.responseTimeMs > 0 ? (
                      <span>{item.responseTimeMs}ms</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-950/90 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 transition-colors">
        <div>
          Showing <span className="font-semibold text-gray-700 dark:text-gray-300">{results.length.toLocaleString()}</span> links
          {isScanning && <span className="ml-2 text-brand-500 animate-pulse font-medium">● Live updating</span>}
        </div>
      </div>
    </div>
  );
};
