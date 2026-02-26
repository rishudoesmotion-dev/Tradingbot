// src/components/ScripSearchBox.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { scripSearchService, ScripResult } from '@/lib/services/ScripSearchService';
import { Search, X, AlertCircle, Loader2, Star, Trash2, ChevronDown } from 'lucide-react';

interface ScripSearchBoxProps {
  onSelect: (scrip: ScripResult) => void;
  placeholder?: string;
  defaultSegment?: string;
}

export default function ScripSearchBox({
  onSelect,
  placeholder = 'Search stocks (e.g., INFY, TCS)...',
  defaultSegment,
}: ScripSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScripResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<ScripResult[]>([]);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('scrip_watchlist');
    if (saved) {
      setWatchlist(JSON.parse(saved));
    }
  }, []);

  // Save watchlist to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('scrip_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  // Search scripss when query changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 1) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await scripSearchService.searchScrips(query, defaultSegment);
        setResults(data);
        setIsOpen(true);
      } catch (err) {
        setError('Failed to search scripss');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }, 300); // Debounce search

    return () => clearTimeout(timer);
  }, [query, defaultSegment]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (scrip: ScripResult) => {
    // Check if already in watchlist
    const isInWatchlist = watchlist.some(
      w => w.p_symbol === scrip.p_symbol && w.p_exch_seg === scrip.p_exch_seg
    );

    if (!isInWatchlist) {
      setWatchlist([...watchlist, scrip]);
    }
    
    setQuery('');
    setIsOpen(false);
  };

  const handleRemoveFromWatchlist = (scrip: ScripResult) => {
    setWatchlist(
      watchlist.filter(
        w => !(w.p_symbol === scrip.p_symbol && w.p_exch_seg === scrip.p_exch_seg)
      )
    );
  };

  const handleSelectFromWatchlist = (scrip: ScripResult) => {
    onSelect(scrip);
  };

  return (
    <div className="relative w-full">
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-20 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setError(null);
              inputRef.current?.focus();
            }}
            className="absolute right-8 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        ) : null}
        {isLoading && (
          <Loader2 className="absolute right-3 w-4 h-4 text-blue-500 animate-spin" />
        )}
        {watchlist.length > 0 && !query && (
          <button
            onClick={() => setShowWatchlist(!showWatchlist)}
            className="absolute right-3 text-gray-600 hover:text-gray-900 flex items-center gap-1 text-xs font-medium"
            title={`${watchlist.length} in watchlist`}
          >
            <Star size={16} className="fill-yellow-400 text-yellow-500" />
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Dropdown results */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
        >
          {results.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-gray-500">
              {query.length > 0 ? 'No scripss found' : 'Type to search...'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {results.map(scrip => (
                <li key={`${scrip.p_symbol}-${scrip.p_exch_seg}`}>
                  <button
                    onClick={() => handleSelect(scrip)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex justify-between items-start group"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 group-hover:text-blue-600">
                        {scrip.p_instr_name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="inline-block bg-gray-100 px-2 py-0.5 rounded mr-2">
                          {scrip.segment}
                        </span>
                        <span>Lot: {scrip.l_lot_size}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Selected scrip info */}
      {/* Watchlist section */}
      {showWatchlist && watchlist.length > 0 && (
        <div className="mt-3 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          <div className="sticky top-0 bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">
              Watchlist ({watchlist.length})
            </h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {watchlist.map(scrip => (
              <li
                key={`${scrip.p_symbol}-${scrip.p_exch_seg}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
              >
                <button
                  onClick={() => handleSelectFromWatchlist(scrip)}
                  className="flex-1 text-left"
                >
                  <div className="font-semibold text-gray-900 hover:text-blue-600">
                    {scrip.p_instr_name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {scrip.segment} • Lot: {scrip.l_lot_size}
                  </div>
                </button>
                <button
                  onClick={() => handleRemoveFromWatchlist(scrip)}
                  className="ml-2 p-1.5 text-gray-400 hover:text-red-600 transition"
                  title="Remove from watchlist"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
