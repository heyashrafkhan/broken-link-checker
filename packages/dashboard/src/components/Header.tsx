import React, { useState, useEffect } from 'react';
import { Link2, Sun, Moon } from 'lucide-react';

export const Header: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    } else {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const handleSelectTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-500/20">
            <Link2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
              Broken Link Scanner
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Unlimited, high-performance link verification
            </p>
          </div>
        </div>

        {/* Explicit Segmented Theme Switcher */}
        <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 border border-gray-300 dark:border-gray-700 shadow-sm">
          <button
            type="button"
            onClick={() => handleSelectTheme('light')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              theme === 'light'
                ? 'bg-white text-gray-900 shadow-sm font-semibold'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
            title="Switch to Light Theme"
          >
            <Sun className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-500' : 'text-gray-400'}`} />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTheme('dark')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              theme === 'dark'
                ? 'bg-gray-900 text-white shadow-sm font-semibold'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
            title="Switch to Dark Theme"
          >
            <Moon className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-blue-400' : 'text-gray-400'}`} />
            <span>Dark</span>
          </button>
        </div>
      </div>
    </header>
  );
};
