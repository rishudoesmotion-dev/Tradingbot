'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { quotesService } from '@/lib/services/QuotesService';
import { ScripResult } from '@/lib/services/ScripSearchService';
import { createClient } from '@supabase/supabase-js';
import { RefreshCw, Star } from 'lucide-react';

const WATCHLIST_KEY = 'scrip_watchlist';

const DEBUG = true; // forced on — disable once strike issue is resolved
const log  = (...a: any[]) => console.log('[OC]', ...a);
const warn = (...a: any[]) => console.warn('[OC]', ...a);

// ─── Types ───────────────────────────────────────────────────────────────────

interface OptionLeg {
  scrip: ScripResult;
  ltp: number;
  ltpLoading: boolean;
}

interface OptionChainRow {
  strike: number;
  ce: OptionLeg | null;
  pe: OptionLeg | null;
}

interface ExpiryInfo {
  label: string;
  raw: string;
  expiryTs?: number;
}

interface OptionsChainProps {
  onSelectScrip: (scrip: ScripResult, side: 'BUY' | 'SELL') => void;
  niftyLTP?: number | null;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundToNearest50(n: number) {
  return Math.round(n / 50) * 50;
}

function toScrip(row: any): ScripResult {
  return {
    id:            row.id,
    p_symbol:      row.p_symbol,
    p_exch_seg:    row.p_exch_seg || 'nse_fo',
    p_trd_symbol:  row.p_trd_symbol,
    l_lot_size:    row.l_lot_size || 75,
    p_instr_name:  row.p_instr_name || '',
    l_expiry_date: row.l_expiry_date,
    segment:       row.segment || 'nse_fo',
    p_tok:         row.p_tok ?? row.p_symbol,
  };
}

// ── Strike / option-type extraction ───────────────────────────────────────────
// Reads from dedicated DB columns when available (most reliable).
// Falls back to parsing p_trd_symbol only if columns are missing.
// Range guard (10,000–35,000) rejects any date-digit false-positives.
function getStrikeAndType(
  row: any,
  strikeCol: string | null,
  optTypeCol: string | null
): { strike: number; optType: string } | null {
  let strike: number | null  = null;
  let optType: string | null = null;

  // 1. Try dedicated DB columns first
  if (strikeCol) {
    const raw = parseFloat(String(row[strikeCol] ?? 0));
    if (raw >= 10_000 && raw <= 35_000) strike = raw;
  }
  if (optTypeCol) {
    const val = String(row[optTypeCol] ?? '').toUpperCase().trim();
    if (val === 'CE' || val === 'PE') optType = val;
  }

  // 2. Fall back to parsing p_trd_symbol
  if (!strike || !optType) {
    const sym = (row.p_trd_symbol || '').toUpperCase();
    const m   = sym.match(/(\d+)(CE|PE)$/);
    if (m) {
      const parsed = parseInt(m[1], 10);
      if (!strike && parsed >= 10_000 && parsed <= 35_000) strike = parsed;
      if (!optType) optType = m[2];
    }
  }

  if (!strike || !optType) return null;
  return { strike, optType };
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// ─── Component ────────────────────────────────────────────────────────────────

export function OptionsChain({ onSelectScrip, niftyLTP }: OptionsChainProps) {
  const [spot,           setSpot]           = useState<number | null>(null);
  const [spotLoading,    setSpotLoading]    = useState(true);
  const [expiries,       setExpiries]       = useState<ExpiryInfo[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<ExpiryInfo | null>(null);
  const [chain,          setChain]          = useState<OptionChainRow[]>([]);
  const [chainLoading,   setChainLoading]   = useState(false);
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null);
  const [lotSize,        setLotSize]        = useState(65);
  const [watchlistSet,   setWatchlistSet]   = useState<Set<string>>(new Set());

  const chainRef   = useRef<OptionChainRow[]>([]);
  chainRef.current = chain;
  const atmRowRef  = useRef<HTMLDivElement | null>(null);
  const ltpMapRef  = useRef<Map<string, number>>(new Map());

  // ── Watchlist ─────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WATCHLIST_KEY);
      if (saved) {
        const items: ScripResult[] = JSON.parse(saved);
        setWatchlistSet(new Set(items.map(s => s.p_trd_symbol)));
      }
    } catch { /* ignore */ }
  }, []);

  const toggleWatchlist = useCallback((scrip: ScripResult) => {
    try {
      const saved   = localStorage.getItem(WATCHLIST_KEY);
      const current: ScripResult[] = saved ? JSON.parse(saved) : [];
      const exists  = current.some(s => s.p_trd_symbol === scrip.p_trd_symbol);
      const updated = exists
        ? current.filter(s => s.p_trd_symbol !== scrip.p_trd_symbol)
        : [...current, scrip];
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
      setWatchlistSet(new Set(updated.map(s => s.p_trd_symbol)));
      window.dispatchEvent(new StorageEvent('storage', {
        key: WATCHLIST_KEY,
        newValue: JSON.stringify(updated),
      }));
    } catch { /* ignore */ }
  }, []);

  // ── Step 1: Load expiries ─────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const nowTs = Math.floor(Date.now() / 1000);

        const { data, error } = await supabase
          .from('scrip_master')
          .select('p_trd_symbol, l_expiry_date, l_lot_size, p_symbol')
          .eq('p_symbol', 'NIFTY')
          .eq('segment', 'nse_fo')
          .gte('l_expiry_date', nowTs)
          .order('l_expiry_date', { ascending: true });

        log('=== EXPIRY QUERY ===');
        log('Row count:', data?.length, '| Error:', error);
        log('Unique p_symbol:', [...new Set(data?.map((r: any) => r.p_symbol))]);
        log('First 10 p_trd_symbols:', data?.slice(0, 10).map((r: any) => r.p_trd_symbol));

        const makeFallback = (): ExpiryInfo[] => [
          { label: '24 MAR', raw: '25MAR24' },
          { label: '27 MAR', raw: '25MAR27' },
          { label: '03 APR', raw: '25APR03' },
        ];

        if (error || !data?.length) {
          warn('Expiry query failed — using fallback');
          const fallback = makeFallback();
          setExpiries(fallback);
          setSelectedExpiry(fallback[0]);
          return;
        }

        const seen = new Map<number, ExpiryInfo>();
        data.forEach((row: any) => {
          const ts: number = row.l_expiry_date;
          if (!ts || seen.has(ts)) return;
          const d     = new Date(ts * 1000);
          const dd    = String(d.getUTCDate()).padStart(2, '0');
          const mon   = MONTHS[d.getUTCMonth()];
          const label = `${dd} ${mon}`;
          const yy    = String(d.getUTCFullYear()).slice(2);
          const ddR   = String(d.getUTCDate()).padStart(2, '0');
          const raw   = `${yy}${mon}${ddR}`;
          seen.set(ts, { label, raw, expiryTs: ts });
        });

        const list = Array.from(seen.values()).filter(e => (e.expiryTs ?? 0) >= nowTs);
        log('Expiry list:', list.map(e => `${e.label} (ts=${e.expiryTs})`));

        if (list.length) {
          setExpiries(list);
          setSelectedExpiry(list[0]);
          const lotRow = data.find((r: any) => (r.l_lot_size || 0) > 0);
          if (lotRow?.l_lot_size) setLotSize(lotRow.l_lot_size);
        } else {
          const fallback = makeFallback();
          setExpiries(fallback);
          setSelectedExpiry(fallback[0]);
        }
      } catch (err) {
        console.error('[OptionsChain] loadExpiries:', err);
      }
    };
    load();
  }, []);

  // ── Step 2: Spot from parent ──────────────────────────────────────────────

  useEffect(() => {
    if (niftyLTP && niftyLTP > 1000) {
      setSpot(niftyLTP);
      setSpotLoading(false);
    }
  }, [niftyLTP]);

  const fetchSpot = useCallback(async () => {
    if (niftyLTP && niftyLTP > 1000) return;
    try {
      const nowTs = Math.floor(Date.now() / 1000);
      const { data: foRows } = await supabase
        .from('scrip_master')
        .select('p_trd_symbol, p_symbol, p_tok')
        .eq('p_symbol', 'NIFTY')
        .eq('segment', 'nse_fo')
        .gte('l_expiry_date', nowTs)
        .order('l_expiry_date', { ascending: true })
        .limit(30);

      if (!foRows?.length) { setSpotLoading(false); return; }

      const batch = foRows.slice(0, 10);
      const res   = await quotesService.getQuotes(
        batch.map(r => ({ segment: 'nse_fo', symbol: r.p_tok ?? r.p_symbol })), 'ltp'
      );

      if (res.success && res.data?.length) {
        let bestSpot = 0;
        for (let i = 0; i < (res.data as any[]).length; i++) {
          const q      = res.data[i] as any;
          const ltp    = parseFloat(String(q.ltp ?? q.ltP ?? q.lp ?? 0));
          const sym    = batch[i]?.p_trd_symbol || '';
          const m      = sym.toUpperCase().match(/(\d+)(CE|PE)$/);
          if (m && ltp > 0) {
            const parsed = parseInt(m[1], 10);
            if (parsed >= 10_000 && parsed <= 35_000) {
              const approxSpot = parsed + ltp;
              if (approxSpot > bestSpot) bestSpot = approxSpot;
            }
          }
        }
        if (bestSpot > 1000) setSpot(Math.round(bestSpot));
      }
      setSpotLoading(false);
    } catch (err) {
      console.error('[OptionsChain] fetchSpot:', err);
      setSpotLoading(false);
    }
  }, [niftyLTP]);

  useEffect(() => {
    fetchSpot();
    const iv = setInterval(fetchSpot, 10_000);
    return () => clearInterval(iv);
  }, [fetchSpot]);

  // ── Step 3: Build chain ───────────────────────────────────────────────────

  const loadChain = useCallback(async (expiry: ExpiryInfo, atmSpot: number) => {
    setChainLoading(true);
    try {
      const atm = roundToNearest50(atmSpot);
      log('=== LOAD CHAIN ===');
      log(`Expiry: ${expiry.label} | raw: ${expiry.raw} | expiryTs: ${expiry.expiryTs} | ATM: ${atm}`);

      // ── Fetch rows ──────────────────────────────────────────────────────
      let rows: any[] | null = null;
      let fetchError: any    = null;

      if (expiry.expiryTs !== undefined) {
        const res = await supabase
          .from('scrip_master')
          .select('*')
          .eq('p_symbol', 'NIFTY')
          .eq('segment', 'nse_fo')
          .eq('l_expiry_date', expiry.expiryTs);
        rows       = res.data;
        fetchError = res.error;
      } else {
        const res = await supabase
          .from('scrip_master')
          .select('*')
          .eq('p_symbol', 'NIFTY')
          .ilike('p_trd_symbol', `NIFTY${expiry.raw}%`)
          .eq('segment', 'nse_fo');
        rows       = res.data;
        fetchError = res.error;
      }

      log(`Rows fetched: ${rows?.length ?? 0} | Error:`, fetchError);

      if (fetchError || !rows?.length) {
        warn('No chain rows — aborting');
        setChainLoading(false);
        return;
      }

      // ── Inspect DB schema ───────────────────────────────────────────────
      const firstRow    = rows[0];
      const allCols     = Object.keys(firstRow);
      const strikeCol   = allCols.find(c => c === 'l_strike_price') ??
                          allCols.find(c => c === 'strike_price')    ??
                          allCols.find(c => c.toLowerCase().includes('strike')) ??
                          null;
      const optTypeCol  = allCols.find(c => c === 'p_option_type') ??
                          allCols.find(c => c === 'option_type')    ??
                          allCols.find(c => c.toLowerCase().includes('option')) ??
                          null;

      log('All columns:', allCols);
      log(`Strike col detected: "${strikeCol}" | OptType col detected: "${optTypeCol}"`);
      log('First 5 raw rows:', rows.slice(0, 5));
      log('Sample p_trd_symbols:', rows.slice(0, 10).map((r: any) => r.p_trd_symbol));

      // ── Lot size ────────────────────────────────────────────────────────
      const lotRow = rows.find((r: any) => (r.l_lot_size || 0) > 0);
      if (lotRow) setLotSize(lotRow.l_lot_size);

      // ── Collect all valid strikes ───────────────────────────────────────
      const allStrikeSet = new Set<number>();
      rows.forEach((row: any) => {
        const result = getStrikeAndType(row, strikeCol, optTypeCol);
        if (result) allStrikeSet.add(result.strike);
      });

      const allStrikes = Array.from(allStrikeSet).sort((a, b) => a - b);
      log(`Valid strikes (${allStrikes.length}):`, allStrikes);

      if (!allStrikes.length) {
        warn('❌ Zero valid strikes extracted! Check logs above.');
        setChainLoading(false);
        return;
      }

      let atmIdx = allStrikes.findIndex(s => s >= atm);
      if (atmIdx < 0) atmIdx = allStrikes.length - 1;

      const start          = Math.max(0, atmIdx - 5);
      const end            = Math.min(allStrikes.length - 1, atmIdx + 5);
      const visibleStrikes = new Set(allStrikes.slice(start, end + 1));
      log(`ATM idx: ${atmIdx} | Visible strikes:`, Array.from(visibleStrikes));

      // ── Build strike map ────────────────────────────────────────────────
      const strikeMap = new Map<number, { ce?: any; pe?: any }>();
      rows.forEach((row: any) => {
        const result = getStrikeAndType(row, strikeCol, optTypeCol);
        if (!result || !visibleStrikes.has(result.strike)) return;
        if (!strikeMap.has(result.strike)) strikeMap.set(result.strike, {});
        const e = strikeMap.get(result.strike)!;
        if (result.optType === 'CE') e.ce = row; else e.pe = row;
      });

      const newChain: OptionChainRow[] = Array.from(strikeMap.keys())
        .sort((a, b) => a - b)
        .map(strike => {
          const e       = strikeMap.get(strike)!;
          const ceScrip = e.ce ? toScrip(e.ce) : null;
          const peScrip = e.pe ? toScrip(e.pe) : null;
          const ceLtp   = ceScrip ? (ltpMapRef.current.get(ceScrip.p_tok ?? '') ?? 0) : 0;
          const peLtp   = peScrip ? (ltpMapRef.current.get(peScrip.p_tok ?? '') ?? 0) : 0;
          return {
            strike,
            ce: ceScrip ? { scrip: ceScrip, ltp: ceLtp, ltpLoading: ceLtp === 0 } : null,
            pe: peScrip ? { scrip: peScrip, ltp: peLtp, ltpLoading: peLtp === 0 } : null,
          };
        });

      log(`✅ Chain ready: ${newChain.length} rows | strikes:`, newChain.map(r => r.strike));
      setChain(newChain);
    } catch (err) {
      console.error('[OptionsChain] loadChain:', err);
    } finally {
      setChainLoading(false);
    }
  }, []);

  const lastAtmRef = useRef<number>(0);
  useEffect(() => {
    if (!selectedExpiry) return;
    const currentSpot = niftyLTP ?? spot ?? 24500;
    const newAtm      = roundToNearest50(currentSpot);
    if (newAtm !== lastAtmRef.current || selectedExpiry.raw !== (window as any).__lastExpiry) {
      lastAtmRef.current           = newAtm;
      (window as any).__lastExpiry = selectedExpiry.raw;
      loadChain(selectedExpiry, currentSpot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpiry?.raw, roundToNearest50(niftyLTP ?? spot ?? 24500)]);

  // ── Step 4: Auto-scroll to ATM ────────────────────────────────────────────

  useEffect(() => {
    if (!chain.length || !atmRowRef.current) return;
    const t = setTimeout(() => {
      atmRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => clearTimeout(t);
  }, [chain]);

  // ── Step 5: LTP polling every 2s ──────────────────────────────────────────

  useEffect(() => { ltpMapRef.current = new Map(); }, [selectedExpiry?.raw]);

  const fetchLTPs = useCallback(async () => {
    const current = chainRef.current;
    if (!current.length) return;

    type Q = { rowIdx: number; side: 'ce' | 'pe'; tok: string };
    const queries: Q[] = [];
    current.forEach((row, i) => {
      if (row.ce?.scrip.p_tok) queries.push({ rowIdx: i, side: 'ce', tok: row.ce.scrip.p_tok });
      if (row.pe?.scrip.p_tok) queries.push({ rowIdx: i, side: 'pe', tok: row.pe.scrip.p_tok });
    });
    if (!queries.length) return;

    try {
      type Change = { rowIdx: number; side: 'ce' | 'pe'; price: number };
      const changes: Change[] = [];

      const BATCH = 50;
      for (let s = 0; s < queries.length; s += BATCH) {
        const batch = queries.slice(s, s + BATCH);
        const res   = await quotesService.getQuotes(
          batch.map(q => ({ segment: 'nse_fo', symbol: q.tok })), 'ltp'
        );
        if (!res.success || !res.data) continue;

        (res.data as any[]).forEach((quote, qi) => {
          const q     = batch[qi];
          if (!q) return;
          const raw   = quote.ltp ?? quote.ltP ?? quote.lp ?? quote.last_price;
          const price = parseFloat(String(raw ?? 0));
          if (isNaN(price) || price <= 0) return;
          const prev  = ltpMapRef.current.get(q.tok);
          if (prev !== price) {
            ltpMapRef.current.set(q.tok, price);
            changes.push({ rowIdx: q.rowIdx, side: q.side, price });
          }
        });
      }

      if (changes.length > 0) {
        setChain(prev => {
          const next = [...prev];
          for (const { rowIdx, side, price } of changes) {
            const row = next[rowIdx];
            if (!row) continue;
            if (side === 'ce' && row.ce)
              next[rowIdx] = { ...row, ce: { ...row.ce, ltp: price, ltpLoading: false } };
            else if (side === 'pe' && row.pe)
              next[rowIdx] = { ...row, pe: { ...row.pe, ltp: price, ltpLoading: false } };
          }
          return next;
        });
        setLastUpdated(new Date());
      }
    } catch (err) {
      warn('fetchLTPs error:', err);
    }
  }, []);

  useEffect(() => {
    if (!selectedExpiry) return;
    const t  = setTimeout(() => fetchLTPs(), 300);
    const id = setInterval(fetchLTPs, 2000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [selectedExpiry?.raw, fetchLTPs]);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const atmStrike = spot ? roundToNearest50(spot) : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white text-gray-900">

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-800">NIFTY 50 Options</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-xs text-gray-500">Spot:</span>
              {spotLoading ? (
                <span className="text-sm font-bold text-gray-400 animate-pulse">…</span>
              ) : spot ? (
                <span className="text-sm font-bold text-emerald-700">
                  {spot.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-sm text-gray-400">--</span>
              )}
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden md:inline">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => { fetchSpot(); fetchLTPs(); }}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
              title="Refresh now"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Expiry tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {expiries.map(exp => (
            <button
              key={exp.raw}
              onClick={() => setSelectedExpiry(exp)}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-all ${
                selectedExpiry?.raw === exp.raw
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {exp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Info bar */}
      <div className="px-4 py-1.5 bg-gray-50 border-b border-slate-200 flex gap-4 text-xs flex-shrink-0">
        <span className="text-gray-500">Lot: <b className="text-gray-800">{lotSize}</b></span>
        {atmStrike && (
          <span className="text-gray-500">ATM: <b className="text-blue-700">{atmStrike.toLocaleString('en-IN')}</b></span>
        )}
        {selectedExpiry && (
          <span className="text-gray-500">Expiry: <b className="text-gray-800">{selectedExpiry.label}</b></span>
        )}
        <span className="text-gray-400 ml-auto">2s updates · ±5 strikes</span>
      </div>

      {/* Column headers */}
      <div className="px-3 py-1.5 bg-gray-100 border-b border-slate-200 flex-shrink-0">
        <div
          style={{ gridTemplateColumns: 'repeat(13,minmax(0,1fr))' }}
          className="grid gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center"
        >
          <div className="col-span-1" />
          <div className="col-span-2">CE LTP</div>
          <div className="col-span-2">CALL</div>
          <div className="col-span-3">Strike</div>
          <div className="col-span-2">PUT</div>
          <div className="col-span-2">PE LTP</div>
          <div className="col-span-1" />
        </div>
      </div>

      {/* Chain rows */}
      <div className="flex-1 overflow-y-auto">
        {chainLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : chain.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            {selectedExpiry ? `No data for ${selectedExpiry.label}` : 'Select an expiry'}
          </div>
        ) : (
          <div>
            {chain.map(row => {
              const isAtm         = atmStrike !== null && row.strike === atmStrike;
              const ceInWatchlist = row.ce ? watchlistSet.has(row.ce.scrip.p_trd_symbol) : false;
              const peInWatchlist = row.pe ? watchlistSet.has(row.pe.scrip.p_trd_symbol) : false;

              return (
                <div
                  key={row.strike}
                  ref={isAtm ? atmRowRef : null}
                  style={{ gridTemplateColumns: 'repeat(13,minmax(0,1fr))' }}
                  className={`grid gap-1 px-3 py-1 text-xs border-b transition-colors ${
                    isAtm ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  {/* ★ CE */}
                  <div className="col-span-1 flex items-center justify-center">
                    {row.ce && (
                      <button onClick={() => toggleWatchlist(row.ce!.scrip)} className="transition-transform hover:scale-125">
                        <Star size={11} className={ceInWatchlist ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 hover:text-yellow-400'} />
                      </button>
                    )}
                  </div>

                  {/* CE LTP */}
                  <div className="col-span-2 flex items-center justify-center font-bold text-orange-600">
                    {row.ce
                      ? row.ce.ltpLoading
                        ? <span className="text-gray-300 animate-pulse">…</span>
                        : row.ce.ltp > 0 ? row.ce.ltp.toFixed(2) : <span className="text-gray-300">--</span>
                      : <span className="text-gray-200">—</span>}
                  </div>

                  {/* CE B/S */}
                  <div className="col-span-2 flex items-center justify-center gap-0.5">
                    {row.ce && (
                      <>
                        <button onClick={() => onSelectScrip(row.ce!.scrip, 'BUY')}  className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs">B</button>
                        <button onClick={() => onSelectScrip(row.ce!.scrip, 'SELL')} className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs">S</button>
                      </>
                    )}
                  </div>

                  {/* Strike */}
                  <div className={`col-span-3 flex flex-col items-center justify-center font-bold ${isAtm ? 'text-blue-700' : 'text-gray-700'}`}>
                    <span>{row.strike.toLocaleString('en-IN')}</span>
                    {isAtm && <span className="text-xs text-blue-500 font-normal leading-none">ATM</span>}
                  </div>

                  {/* PE B/S */}
                  <div className="col-span-2 flex items-center justify-center gap-0.5">
                    {row.pe && (
                      <>
                        <button onClick={() => onSelectScrip(row.pe!.scrip, 'BUY')}  className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs">B</button>
                        <button onClick={() => onSelectScrip(row.pe!.scrip, 'SELL')} className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-xs">S</button>
                      </>
                    )}
                  </div>

                  {/* PE LTP */}
                  <div className="col-span-2 flex items-center justify-center font-bold text-blue-600">
                    {row.pe
                      ? row.pe.ltpLoading
                        ? <span className="text-gray-300 animate-pulse">…</span>
                        : row.pe.ltp > 0 ? row.pe.ltp.toFixed(2) : <span className="text-gray-300">--</span>
                      : <span className="text-gray-200">—</span>}
                  </div>

                  {/* ★ PE */}
                  <div className="col-span-1 flex items-center justify-center">
                    {row.pe && (
                      <button onClick={() => toggleWatchlist(row.pe!.scrip)} className="transition-transform hover:scale-125">
                        <Star size={11} className={peInWatchlist ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 hover:text-yellow-400'} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}