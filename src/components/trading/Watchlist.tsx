'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ScripResult } from '@/lib/services/ScripSearchService';
import { getDynamicPollingService } from '@/lib/services/DynamicPollingService';
import { Search, X, Star, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { scripSearchService } from '@/lib/services/ScripSearchService';
import { quotesService } from '@/lib/services/QuotesService';
import { createClient } from '@supabase/supabase-js';
import { isMarketOpen } from '@/lib/utils/marketHours';
import { getMarketDataStreamService, PriceUpdate } from '@/lib/services/MarketDataStreamService';

export const WATCHLIST_KEY = 'scrip_watchlist';

interface WatchlistProps {
  onSelectScrip: (scrip: ScripResult, side: 'BUY' | 'SELL') => void;
  niftyLTP?: number | null;
  onLTPUpdate?: (trdSymbol: string, ltp: number) => void;
}

interface LTPData {
  ltp: number;
  change: number;
  perChange: number;
}

// ── Strike extractor ──────────────────────────────────────────────────────────
// Handles both Kotak p_trd_symbol formats for NIFTY 50:
//   Weekly : NIFTY26324 23300 CE  → NIFTY + 5 digits + strike + CE/PE
//   Monthly: NIFTY26MAR24 23300 CE → NIFTY + 2d + 3letters + 2d + strike + CE/PE
// Returns [strikeNumber, optionType] or null.
function extractStrike(trdSymbol: string): [number, string] | null {
  const sym = (trdSymbol || '').toUpperCase();
  const m   = sym.match(/^NIFTY(?:\d{5}|\d{2}[A-Z]{3}\d{2})(\d+)(CE|PE)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), m[2]];
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

export default function Watchlist({ onSelectScrip, niftyLTP, onLTPUpdate }: WatchlistProps) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<ScripResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [watchlist, setWatchlist]   = useState<ScripResult[]>([]);
  const [ltpMap, setLtpMap]         = useState<Map<string, LTPData>>(new Map());

  const searchTimerRef              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scripKeyToTrdSym            = useRef<Map<string, string>>(new Map());
  const wsActiveRef                 = useRef(false);

  // ── Token enrichment ──────────────────────────────────────────────────────

  const enrichWithTokens = useCallback(async (list: ScripResult[]): Promise<ScripResult[]> => {
    const fnoMissingTok = list.filter(s => {
      const seg = (s.p_exch_seg || s.segment || '').toLowerCase();
      return seg.includes('_fo') && !s.p_tok;
    });
    if (fnoMissingTok.length === 0) return list;

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );
      const trdSymbols = fnoMissingTok.map(s => s.p_trd_symbol).filter(Boolean);
      const { data, error } = await supabase
        .from('scrip_master')
        .select('p_trd_symbol, p_tok, p_symbol')
        .in('p_trd_symbol', trdSymbols);

      if (!error && data?.length) {
        const tokMap = new Map<string, string>(
          data.filter((r: any) => r.p_tok).map((r: any) => [r.p_trd_symbol as string, r.p_tok as string])
        );
        if (tokMap.size > 0) {
          const enriched = list.map(s =>
            tokMap.has(s.p_trd_symbol) ? { ...s, p_tok: tokMap.get(s.p_trd_symbol) } : s
          );
          localStorage.setItem(WATCHLIST_KEY, JSON.stringify(enriched));
          return enriched;
        }
      }
    } catch (err) {
      console.warn('[Watchlist] enrichWithTokens error:', err);
    }
    return list;
  }, []);

  // ── Load watchlist ────────────────────────────────────────────────────────
  // Add this useEffect after the initial load useEffect
useEffect(() => {
  const handleStorage = (e: StorageEvent) => {
    if (e.key !== WATCHLIST_KEY) return;
    try {
      const items: ScripResult[] = e.newValue ? JSON.parse(e.newValue) : [];
      setWatchlist(items);
    } catch { /* ignore */ }
  };
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}, []);


  useEffect(() => {
    const load = async () => {
      const saved = localStorage.getItem(WATCHLIST_KEY);
      let items: ScripResult[] = [];
      if (saved) {
        try { items = JSON.parse(saved); } catch { items = []; }
      } else {
        try {
          const defaults = await scripSearchService.getNiftyStrikeOptions(24800);
          if (defaults.length > 0) {
            items = defaults;
            localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
          }
        } catch { /* silent */ }
      }
      if (items.length > 0) {
        setWatchlist(items);
        enrichWithTokens(items).then(setWatchlist);
      }
    };
    load();
  }, [enrichWithTokens]);

  const saveWatchlist = (list: ScripResult[]) => {
    setWatchlist(list);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  };

  // ── Quote symbol resolution ───────────────────────────────────────────────

  const getQuoteSymbol = (scrip: ScripResult): string => {
    const seg = (scrip.p_exch_seg || scrip.segment || '').toLowerCase();
    if (seg.includes('_fo')) return scrip.p_tok || scrip.p_symbol || '';
    return scrip.p_symbol;
  };

  // ── REST LTP fetch ────────────────────────────────────────────────────────

  const fetchLTPs = useCallback(async () => {
    if (watchlist.length === 0) return;

    const indexedQueries: Array<{ segment: string; symbol: string; trdSymbol: string }> = [];
    watchlist.forEach(scrip => {
      const symbol = getQuoteSymbol(scrip);
      if (!symbol) return;
      indexedQueries.push({
        segment:   scrip.p_exch_seg || scrip.segment || 'nse_cm',
        symbol,
        trdSymbol: scrip.p_trd_symbol || scrip.p_symbol || '',
      });
    });
    if (!indexedQueries.length) return;

    const response = await quotesService.getQuotes(
      indexedQueries.map(q => ({ segment: q.segment, symbol: q.symbol })),
      'ltp'
    );
    if (!response.success || !response.data) return;

    setLtpMap(prev => {
      const next = new Map(prev);
      (response.data as any[]).forEach((q: any, i: number) => {
        if (!indexedQueries[i]) return;
        const ltp = parseFloat(String(q.ltp ?? q.ltP ?? q.lp ?? q.last_price ?? '0')) || 0;
        next.set(indexedQueries[i].trdSymbol, {
          ltp,
          change:    parseFloat(String(q.change ?? q.chg ?? '0'))                        || 0,
          perChange: parseFloat(String(q.per_change ?? q.pChange ?? q.pct_change ?? '0')) || 0,
        });
      });
      return next;
    });
  }, [watchlist]);

  // ── WebSocket streaming ───────────────────────────────────────────────────

  useEffect(() => {
    if (watchlist.length === 0) return;
    if (!isMarketOpen()) return;

    const scripKeys: string[] = [];
    const keyToSym = new Map<string, string>();
    watchlist.forEach(scrip => {
      const seg    = (scrip.p_exch_seg || scrip.segment || 'nse_cm').toLowerCase();
      const isFnO  = seg.includes('_fo');
      const sym    = isFnO ? (scrip.p_tok || null) : scrip.p_symbol;
      if (!sym) return;
      const key = `${seg}|${sym}`;
      scripKeys.push(key);
      keyToSym.set(key, scrip.p_trd_symbol || scrip.p_symbol || '');
    });
    scripKeyToTrdSym.current = keyToSym;

    if (!scripKeys.length) return;

    const sessionRaw  = localStorage.getItem('kotak_session');
    const session     = sessionRaw ? JSON.parse(sessionRaw) : null;
    const streamService = getMarketDataStreamService();

    const handlePriceUpdate = (update: PriceUpdate) => {
      const trdSym = scripKeyToTrdSym.current.get(update.symbol) || update.symbol;
      setLtpMap(prev => {
        const next = new Map(prev);
        next.set(trdSym, { ltp: update.ltp, change: update.change ?? 0, perChange: update.changePercent ?? 0 });
        return next;
      });
      if (update.ltp > 0) onLTPUpdate?.(trdSym, update.ltp);
    };

    const startRestPolling = () => {
      const svc = getDynamicPollingService();
      if (!svc.isActive()) svc.startPolling(() => { if (isMarketOpen()) fetchLTPs(); }, true);
    };

    if (session?.tradingToken && session?.tradingSid) {
      streamService.subscribe(session, scripKeys, handlePriceUpdate)
        .then(() => { wsActiveRef.current = true; })
        .catch(() => { wsActiveRef.current = false; startRestPolling(); });
    } else {
      startRestPolling();
    }

    return () => {
      streamService.removeSubscriptions(scripKeys);
      wsActiveRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  useEffect(() => {
    if (!isMarketOpen() || wsActiveRef.current) return;
    const svc = getDynamicPollingService();
    if (!svc.isActive()) svc.startPolling(() => { if (isMarketOpen()) fetchLTPs(); }, watchlist.length > 0);
    else svc.updatePositionStatus(watchlist.length > 0);
  }, [fetchLTPs, watchlist.length]);

  // ── Smart search ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const trimmed = query.trim();

    if (trimmed.length < 1) {
      setResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        );

        const isNiftyQuery  = /^nifty$/i.test(trimmed);
        const isStrikeQuery = /^\d{4,6}$/.test(trimmed);

        let data: ScripResult[] = [];

        const rowToScrip = (row: any): ScripResult => ({
          id:            row.id,
          p_symbol:      row.p_symbol,
          p_exch_seg:    row.p_exch_seg || 'nse_fo',
          p_trd_symbol:  row.p_trd_symbol,
          l_lot_size:    row.l_lot_size || 65,
          p_instr_name:  row.p_instr_name || '',
          l_expiry_date: row.l_expiry_date,
          segment:       row.segment || 'nse_fo',
          p_tok:         row.p_symbol,  // p_symbol IS the numeric token in this DB
        });

        if (isNiftyQuery || isStrikeQuery) {
          const nowTs = Math.floor(Date.now() / 1000);

          const { data: expiryRows } = await supabase
            .from('scrip_master')
            .select('l_expiry_date')
            .ilike('p_trd_symbol', 'NIFTY%CE')
            .not('p_trd_symbol', 'ilike', 'NIFTYNXT%')
            .not('p_trd_symbol', 'ilike', 'NIFTYIT%')
            .not('p_trd_symbol', 'ilike', 'NIFTYMIC%')
            .eq('segment', 'nse_fo')
            .gte('l_expiry_date', nowTs)
            .order('l_expiry_date', { ascending: true })
            .limit(1);

          const nearestExpiry: number | null = expiryRows?.[0]?.l_expiry_date ?? null;

          if (!nearestExpiry) {
            data = await scripSearchService.searchScrips(trimmed);
          } else if (isNiftyQuery) {
            // ── Mode A: "NIFTY" → ±5 strikes around live ATM ──────────────
            const { data: rows } = await supabase
              .from('scrip_master')
              .select('*')
              .eq('p_symbol', 'NIFTY')         // explicit NIFTY 50 only
              .eq('segment', 'nse_fo')
              .eq('l_expiry_date', nearestExpiry);

            if (rows?.length) {
              // Parse strikes using format-aware extractor
              const strikeMap = new Map<number, { ce?: any; pe?: any }>();
              rows.forEach((row: any) => {
                const parsed = extractStrike(row.p_trd_symbol || '');
                if (!parsed) return;
                const [strike, type] = parsed;
                if (!strikeMap.has(strike)) strikeMap.set(strike, {});
                const e = strikeMap.get(strike)!;
                if (type === 'CE') e.ce = row; else e.pe = row;
              });

              const allStrikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);

              const atmSpot = niftyLTP && niftyLTP > 1000 ? niftyLTP : null;
              let atmIdx: number;
              if (atmSpot) {
                atmIdx = allStrikes.reduce((best, s, i) =>
                  Math.abs(s - atmSpot) < Math.abs(allStrikes[best] - atmSpot) ? i : best, 0);
              } else {
                atmIdx = Math.floor(allStrikes.length / 2);
              }

              const start = Math.max(0, atmIdx - 5);
              const end   = Math.min(allStrikes.length - 1, atmIdx + 5);

              allStrikes.slice(start, end + 1).forEach(strike => {
                const e = strikeMap.get(strike)!;
                if (e.ce) data.push(rowToScrip(e.ce));
                if (e.pe) data.push(rowToScrip(e.pe));
              });
            }
          } else {
            // ── Mode B: strike number e.g. "24500" → CE + PE ──────────────
            const fetchStrikeRows = async (type: 'CE' | 'PE') => {
              const { data: rows } = await supabase
                .from('scrip_master')
                .select('*')
                .ilike('p_trd_symbol', `NIFTY%${trimmed}${type}`)
                .not('p_trd_symbol', 'ilike', 'NIFTYNXT%')
                .not('p_trd_symbol', 'ilike', 'NIFTYIT%')
                .eq('segment', 'nse_fo')
                .eq('l_expiry_date', nearestExpiry);
              return rows ?? [];
            };

            const [ceRows, peRows] = await Promise.all([
              fetchStrikeRows('CE'),
              fetchStrikeRows('PE'),
            ]);

            // JS-side exact strike validation using format-aware extractor
            const targetStrike = parseInt(trimmed, 10);
            const validCE = ceRows.filter((r: any) => {
              const parsed = extractStrike(r.p_trd_symbol || '');
              return parsed && parsed[0] === targetStrike && parsed[1] === 'CE';
            });
            const validPE = peRows.filter((r: any) => {
              const parsed = extractStrike(r.p_trd_symbol || '');
              return parsed && parsed[0] === targetStrike && parsed[1] === 'PE';
            });

            data = [...validCE, ...validPE].map(rowToScrip);
          }
        } else {
          // ── Mode C: generic symbol search ──────────────────────────────
          data = await scripSearchService.searchScrips(trimmed);
        }

        setQuery(current => {
          if (current.trim() !== trimmed) return current;
          setResults(data);
          setShowDropdown(true);
          return current;
        });
      } catch (err) {
        console.error('[Watchlist] search error:', err);
        setResults([]);
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  const clearSearch = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    setIsSearching(false);
  };

  const addToWatchlist = (scrip: ScripResult) => {
    const exists = watchlist.some(
      w => w.p_trd_symbol === scrip.p_trd_symbol && w.p_exch_seg === scrip.p_exch_seg
    );
    if (!exists) saveWatchlist([...watchlist, scrip]);
    clearSearch();
  };

  const removeFromWatchlist = (scrip: ScripResult) => {
    saveWatchlist(
      watchlist.filter(w => !(w.p_trd_symbol === scrip.p_trd_symbol && w.p_exch_seg === scrip.p_exch_seg))
    );
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const segmentColor: Record<string, string> = {
    nse_fo: 'bg-blue-100 text-blue-700',
    nse_cm: 'bg-green-100 text-green-700',
    bse_fo: 'bg-purple-100 text-purple-700',
    bse_cm: 'bg-yellow-100 text-yellow-700',
    cde_fo: 'bg-orange-100 text-orange-700',
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* Search */}
      <div className="p-3 border-b border-gray-200 relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            placeholder="Search symbol to add..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {isSearching ? (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : query ? (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          ) : null}
        </div>

        {/* Search dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
            {results.map((scrip, idx) => {
              const trd      = scrip.p_trd_symbol?.toUpperCase() || '';
              const parsed   = extractStrike(trd);  // format-aware extractor
              const isOption = parsed !== null;
              const isCE     = parsed?.[1] === 'CE';
              const isPE     = parsed?.[1] === 'PE';
              const strike   = parsed ? parsed[0] : null;

              const expiryLabel = scrip.l_expiry_date
                ? (() => {
                    const d = new Date((scrip.l_expiry_date as number) * 1000);
                    return `${String(d.getUTCDate()).padStart(2,'0')} ${MONTHS[d.getUTCMonth()]}`;
                  })()
                : null;

              const typeBadge = isCE
                ? 'bg-emerald-100 text-emerald-700'
                : isPE
                ? 'bg-red-100 text-red-700'
                : '';

              const label = isOption && strike
                ? `NIFTY ${strike.toLocaleString('en-IN')}`
                : scrip.p_instr_name || scrip.p_trd_symbol || scrip.p_symbol;

              return (
                <button
                  key={`${scrip.p_exch_seg}-${scrip.p_symbol}-${scrip.p_trd_symbol}-${idx}`}
                  onClick={() => addToWatchlist(scrip)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOption && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${typeBadge}`}>
                        {isCE ? 'CE' : 'PE'}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-600">
                        {label}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {expiryLabel && (
                          <span className="text-xs text-gray-400">{expiryLabel}</span>
                        )}
                        {!isOption && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${segmentColor[scrip.segment] || 'bg-gray-100 text-gray-600'}`}>
                            {scrip.segment}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">Lot: {scrip.l_lot_size}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-blue-500 font-medium opacity-0 group-hover:opacity-100 flex-shrink-0 ml-2">+ Add</span>
                </button>
              );
            })}
          </div>
        )}

        {showDropdown && results.length === 0 && !isSearching && query.trim().length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-4 text-center text-sm text-gray-500">
            No results found for "{query.trim()}"
          </div>
        )}
      </div>

      {/* Watchlist Header */}
      <div className="px-3 py-2 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Star size={14} className="fill-yellow-400 text-yellow-500" />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Watchlist</span>
          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{watchlist.length}</span>
        </div>
      </div>

      {/* Watchlist Items */}
      <div className="flex-1 overflow-y-auto">
        {watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-gray-400">
            <Star size={28} className="mb-2 opacity-30" />
            <p className="text-sm font-medium">Watchlist is empty</p>
            <p className="text-xs mt-1">Search above to add instruments</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {watchlist.map(scrip => {
              const ltpData = ltpMap.get(scrip.p_trd_symbol || scrip.p_symbol || '');
              const isUp    = (ltpData?.change ?? 0) >= 0;

              // ── Label: use format-aware extractor for correct strike ──────
              const getLabel = () => {
                const parsed = extractStrike(scrip.p_trd_symbol || '');
                if (parsed) {
                  const [strike, optType] = parsed;
                  return `NIFTY ${strike.toLocaleString('en-IN')} ${optType}`;
                }
                return scrip.p_instr_name || scrip.p_trd_symbol || scrip.p_symbol;
              };

              const getExpiry = () => {
                if (!scrip.l_expiry_date) return null;
                const d = new Date((scrip.l_expiry_date as number) * 1000);
                return `${String(d.getUTCDate()).padStart(2,'0')} ${MONTHS[d.getUTCMonth()]}`;
              };

              const expiry = getExpiry();

              return (
                <li
                  key={`${scrip.p_exch_seg}-${scrip.p_trd_symbol || scrip.p_symbol}`}
                  className="group px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">

                    {/* Left: name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                        {getLabel()}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {expiry && (
                          <span className="text-xs text-gray-400">{expiry}</span>
                        )}
                        <span className="text-xs text-gray-300">·</span>
                        {ltpData ? (
                          <span className={`text-xs font-bold ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{ltpData.ltp.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Lot: {scrip.l_lot_size}</span>
                        )}
                        {ltpData && (
                          <span className={`text-xs ${isUp ? 'text-green-500' : 'text-red-400'}`}>
                            {isUp ? '+' : ''}{ltpData.perChange.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: B / S + trash */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onSelectScrip(scrip, 'BUY')}
                        className="w-7 h-7 text-xs font-bold bg-green-500 hover:bg-green-600 text-white rounded transition flex items-center justify-center"
                      >B</button>
                      <button
                        onClick={() => onSelectScrip(scrip, 'SELL')}
                        className="w-7 h-7 text-xs font-bold bg-red-500 hover:bg-red-600 text-white rounded transition flex items-center justify-center"
                      >S</button>
                      <button
                        onClick={() => removeFromWatchlist(scrip)}
                        className="w-6 h-6 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex items-center justify-center"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}