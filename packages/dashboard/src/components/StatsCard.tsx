import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  color?: 'default' | 'red' | 'green' | 'blue' | 'yellow';
  suffix?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  icon: Icon,
  label,
  value,
  color = 'default',
  suffix,
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (typeof value === 'number' && typeof prevValueRef.current === 'number') {
      const start = prevValueRef.current;
      const end = value;
      if (start === end) return;

      const duration = 300;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = Math.round(start + (end - start) * eased);
        setDisplayValue(current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    } else {
      setDisplayValue(value);
    }
    prevValueRef.current = value;
  }, [value]);

  const colorStyles = {
    default: {
      icon: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-100 dark:bg-gray-800/50',
    },
    red: {
      icon: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/30',
    },
    green: {
      icon: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    blue: {
      icon: 'text-brand-600 dark:text-brand-500',
      bg: 'bg-brand-50 dark:bg-brand-950/30',
    },
    yellow: {
      icon: 'text-amber-600 dark:text-yellow-400',
      bg: 'bg-amber-50 dark:bg-yellow-950/30',
    },
  };

  const style = colorStyles[color];

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 flex items-center gap-3 min-w-0 shadow-sm dark:shadow-none transition-colors">
      <div className={`p-2 rounded-lg ${style.bg} transition-colors`}>
        <Icon className={`w-4 h-4 ${style.icon}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-medium">{label}</p>
        <p className="text-lg font-semibold font-mono tabular-nums tracking-tight animate-counter text-gray-900 dark:text-gray-100">
          {typeof displayValue === 'number'
            ? displayValue.toLocaleString('en-US')
            : displayValue}
          {suffix && <span className="text-xs text-gray-500 dark:text-gray-400 ml-0.5">{suffix}</span>}
        </p>
      </div>
    </div>
  );
};
