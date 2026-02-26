// src/components/StockSearch.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Loader, AlertCircle } from 'lucide-react';
import { ScripMasterService } from '@/lib/services/ScripMasterService';

interface SearchResult {
  pSymbol: string;
  pExchSeg: string;
  pTrdSymbol: string;
  lLotSize: number;
  [key: string]: any;
}

interface StockSearchProps {
  consumerKey: string;
  onSelectStock?: (stock: SearchResult) => void;
}

export default function StockSearch({ consumerKey, onSelectStock }: StockSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<string>('');

  const scripService = useCallback(
    () => new ScripMasterService(consumerKey),
    [consumerKey]
  );

  const handleSearch = useCallback(
    async (term: string) => {
      if (term.length < 2) {
        setResults([]);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const service = scripService();
        const searchResults = await service.searchBySymbol(
          term,
          selectedSegment || undefined
        );

        setResults(searchResults);

        if (searchResults.length === 0) {
          setError('No stocks found matching your search');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Search failed';
        setError(errorMsg);
        setResults([]);
        console.error('Search error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [scripService, selectedSegment]
  );

  const handleSelectStock = (stock: SearchResult) => {
    setSearchTerm(stock.pSymbol);
    setResults([]);
    setIsOpen(false);

    if (onSelectStock) {
      onSelectStock(stock);
    }
  };

  const segments = [
    { value: '', label: 'All Segments' },
    { value: 'nse_cm', label: 'NSE Equity' },
    { value: 'bse_cm', label: 'BSE Equity' },
    { value: 'nse_fo', label: 'NSE F&O' },
    { value: 'bse_fo', label: 'BSE F&O' },
    { value: 'cde_fo', label: 'CDE F&O' },
    { value: 'mcx_fo', label: 'MCX Futures' },
  ];

  return (
    <div className="w-full">
      <div className="space-y-3">
        {/* Segment Selector */}
        <div className="flex gap-2">
          <select
            value={selectedSegment}
            onChange={e => {
              setSelectedSegment(e.target.value);
              if (searchTerm) {
                handleSearch(searchTerm);
              }
            }}
            className="flex-shrink-0 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {segments.map(seg => (
              <option key={seg.value} value={seg.value}>
                {seg.label}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="flex-1 relative">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-2.5 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search stocks... (e.g., TCS, INFY)"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  handleSearch(e.target.value);
                }}
                onFocus={() => setIsOpen(true)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {isLoading && (
                <Loader
                  size={18}
                  className="absolute right-3 top-2.5 text-blue-500 animate-spin"
                />
              )}
            </div>

            {/* Dropdown Results */}
            {isOpen && (searchTerm || results.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
                {error && (
                  <div className="p-3 flex items-center gap-2 text-red-600 text-sm bg-red-50 border-b border-red-200">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                {isLoading && (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    <div className="inline-block animate-spin">
                      <Loader size={20} />
                    </div>
                    <p className="mt-2">Searching...</p>
                  </div>
                )}

                {!isLoading && results.length > 0 && (
                  <ul className="max-h-64 overflow-y-auto">
                    {results.map((stock, index) => (
                      <li key={`${stock.pSymbol}-${index}`}>
                        <button
                          onClick={() => handleSelectStock(stock)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          <div className="font-medium text-gray-900">
                            {stock.pSymbol}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {stock.pTrdSymbol} • {stock.pExchSeg}
                            {stock.lLotSize && ` • Lot: ${stock.lLotSize}`}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {!isLoading && searchTerm && results.length === 0 && !error && (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    Type at least 2 characters to search
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Selected Stock Info */}
        {searchTerm && results.length === 0 && !error && !isLoading && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            Selected: <span className="font-semibold">{searchTerm}</span>
          </div>
        )}
      </div>
    </div>
  );
}
