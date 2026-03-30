'use client';

import { useState, useEffect, useRef } from 'react';
import { ScripResult } from '@/lib/services/ScripSearchService';
import { TrendingUp, TrendingDown, Loader2, CheckCircle, AlertCircle, X, ShieldOff } from 'lucide-react';

interface OrderFormProps {
  selectedScrip: ScripResult | null;
  defaultSide: 'BUY' | 'SELL';
  isConnected: boolean;
  isLoading: boolean;
  currentLTP?: number;
  isTradingEnabled: boolean;           // ← NEW prop
  onPlaceOrder: (order: OrderPayload) => Promise<{ success: boolean; message: string }>;
  onClear: () => void;
}

export interface OrderPayload {
  symbol: string;
  trdSymbol: string;
  exchSeg: string;
  side: 'BUY' | 'SELL';
  orderType: 'L' | 'SL';
  productType: 'MIS' | 'CNC' | 'NRML';
  quantity: number;
  price: number;
  triggerPrice: number;
  lotSize: number;
}

type UIOrderType = 'LIMIT' | 'SL';

const ORDER_TYPE_MAP: Record<UIOrderType, 'L' | 'SL'> = {
  LIMIT: 'L',
  SL:    'SL',
};

function extractStrike(trdSymbol: string): [number, string] | null {
  const sym = (trdSymbol || '').replace(/\s+/g, '').toUpperCase();
  let m = sym.match(/^NIFTY\d{2}[A-Z]{3}(\d{4,6})(CE|PE)$/);
  if (m) return [parseInt(m[1], 10), m[2]];
  m = sym.match(/^NIFTY\d{5}(\d{4,6})(CE|PE)$/);
  if (m) return [parseInt(m[1], 10), m[2]];
  return null;
}

function getScripLabelFromScrip(scrip: ScripResult): string {
  const fromTrd = extractStrike(scrip.p_trd_symbol || '');
  if (fromTrd) {
    const [strike, optType] = fromTrd;
    return `NIFTY ${strike.toLocaleString('en-IN')} ${optType}`;
  }
  if (scrip.p_symbol) {
    const fromSym = extractStrike(scrip.p_symbol);
    if (fromSym) {
      const [strike, optType] = fromSym;
      return `NIFTY ${strike.toLocaleString('en-IN')} ${optType}`;
    }
  }
  return scrip.p_instr_name || scrip.p_trd_symbol || scrip.p_symbol || '';
}

export default function OrderForm({
  selectedScrip,
  defaultSide,
  isConnected,
  isLoading,
  currentLTP,
  isTradingEnabled,   // ← destructure new prop
  onPlaceOrder,
  onClear,
}: OrderFormProps) {
  const [side, setSide]               = useState<'BUY' | 'SELL'>(defaultSide);
  const [orderType, setOrderType]     = useState<UIOrderType>('LIMIT');
  const [productType, setProductType] = useState<'MIS' | 'CNC' | 'NRML'>('MIS');
  const [lots, setLots]               = useState(1);
  const [price, setPrice]             = useState(0);
  const [triggerPrice, setTriggerPrice] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult]           = useState<{ success: boolean; message: string } | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  const [displayedLTP, setDisplayedLTP]   = useState<number>(0);
  const [ltpFlash, setLtpFlash]           = useState<'up' | 'down' | null>(null);
  const prevLTPRef                         = useRef<number>(0);
  const flashTimerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentLTP || currentLTP <= 0) return;
    if (prevLTPRef.current > 0 && currentLTP !== prevLTPRef.current) {
      const dir = currentLTP > prevLTPRef.current ? 'up' : 'down';
      setLtpFlash(dir);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setLtpFlash(null), 700);
    }
    prevLTPRef.current = currentLTP;
    setDisplayedLTP(currentLTP);
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, [currentLTP]);

  useEffect(() => {
    setDisplayedLTP(0);
    prevLTPRef.current = 0;
    setLtpFlash(null);
    setLots(1);
    setPrice(0);
    setTriggerPrice(0);
    setOrderType('LIMIT');
    setResult(null);
  }, [selectedScrip?.p_trd_symbol]);

  useEffect(() => { setSide(defaultSide); }, [defaultSide, selectedScrip]);

  const ltpReady       = displayedLTP > 0;
  const ltp            = displayedLTP;
  const lotSize        = selectedScrip?.l_lot_size || 1;
  const totalQty       = lots * lotSize;
  const isBuy          = side === 'BUY';
  const estimatedValue = ltpReady ? ltp * totalQty : null;

  const handleOrderTypeChange = (t: UIOrderType) => {
    setOrderType(t);
    if (price === 0 && ltpReady)         setPrice(parseFloat(ltp.toFixed(2)));
    if (t === 'SL' && triggerPrice === 0 && ltpReady) setTriggerPrice(parseFloat(ltp.toFixed(2)));
  };

  const handleConfirm = async () => {
    if (!selectedScrip) return;
    setSubmitting(true);
    setResult(null);
    const payload: OrderPayload = {
      symbol:       selectedScrip.p_symbol,
      trdSymbol:    selectedScrip.p_trd_symbol,
      exchSeg:      selectedScrip.p_exch_seg,
      side,
      orderType:    ORDER_TYPE_MAP[orderType],
      productType,
      quantity:     totalQty,
      price,
      triggerPrice: orderType === 'SL' ? triggerPrice : 0,
      lotSize,
    };
    try {
      const res = await onPlaceOrder(payload);
      setResult(res);
      setShowConfirm(false);
      if (res.success) { setLots(1); setPrice(0); setTriggerPrice(0); }
    } finally {
      setSubmitting(false);
    }
  };

  const getScripLabel = () => selectedScrip ? getScripLabelFromScrip(selectedScrip) : '';

  const getExpiryLabel = () => {
    if (!selectedScrip?.l_expiry_date) return null;
    const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const d = new Date((selectedScrip.l_expiry_date as number) * 1000);
    return `${String(d.getUTCDate()).padStart(2,'0')} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };

  const ltpTextColor = ltpFlash === 'up' ? '#16a34a' : ltpFlash === 'down' ? '#dc2626' : '#111827';

  // ── Derived: is placing an order currently allowed? ────────────────────────
  const canPlaceOrder = isConnected && isTradingEnabled;

  return (
    <div className="flex flex-col h-full bg-white text-gray-900">

      {/* ── Header ── */}
      <div className="px-3 pt-3 pb-3 border-b border-gray-100">
        {selectedScrip ? (
          <>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-bold text-gray-900 text-sm truncate">{getScripLabel()}</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0 border border-slate-200">
                  {(selectedScrip.segment || selectedScrip.p_exch_seg || '').toUpperCase()}
                </span>
              </div>
              <button onClick={onClear} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                <X size={14} />
              </button>
            </div>

            <div className="flex gap-3 text-xs text-gray-400 mb-3">
              {getExpiryLabel() && <span>{getExpiryLabel()}</span>}
              <span>Lot: <b className="text-gray-500">{lotSize}</b></span>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">LTP</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: ltpReady ? '#22c55e' : '#d1d5db',
                        boxShadow:  ltpReady ? '0 0 0 0 #22c55e' : 'none',
                        animation:  ltpReady ? 'ltpPulse 2s ease-out infinite' : 'none',
                      }}
                    />
                    <style>{`
                      @keyframes ltpPulse {
                        0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
                        70%  { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
                        100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
                      }
                    `}</style>
                  </div>
                  {ltpReady ? (
                    <span
                      className="text-2xl font-bold tabular-nums transition-colors duration-500"
                      style={{ color: ltpTextColor, letterSpacing: '-0.02em' }}
                    >
                      ₹{ltp.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-xl font-bold text-gray-200 animate-pulse select-none">₹ — — —</span>
                  )}
                </div>
                {estimatedValue && (
                  <div className="text-right">
                    <div className="text-xs text-gray-400 mb-0.5">Est. Value</div>
                    <div className="text-sm font-bold text-gray-700 tabular-nums">
                      ₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 text-center py-3">Select an instrument to trade</p>
        )}
      </div>

      {selectedScrip && (
        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

          {/* ── BUY / SELL toggle ── */}
          <div className="grid grid-cols-2 rounded-lg overflow-hidden border border-gray-200 shadow-sm w-full min-w-0">
            <button
              onClick={() => setSide('BUY')}
              className={`w-full min-w-0 py-2.5 text-xs font-bold tracking-wide transition-all ${
                isBuy ? 'bg-emerald-500 text-white' : 'bg-white text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'
              }`}
            >▲ BUY</button>
            <button
              onClick={() => setSide('SELL')}
              className={`w-full min-w-0 py-2.5 text-xs font-bold tracking-wide border-l border-gray-200 transition-all ${
                !isBuy ? 'bg-red-500 text-white' : 'bg-white text-gray-400 hover:bg-red-50 hover:text-red-500'
              }`}
            >▼ SELL</button>
          </div>

          {/* ── Order Type ── */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-1">
              {(['LIMIT', 'SL'] as const).map(t => (
                <button key={t} onClick={() => handleOrderTypeChange(t)}
                  className={`py-1.5 text-xs font-semibold rounded-md border transition-all ${
                    orderType === t
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-slate-400'
                  }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* ── Product Type ── */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Product</label>
            <div className="grid grid-cols-3 gap-1">
              {(['MIS', 'NRML', 'CNC'] as const).map(p => (
                <button key={p} onClick={() => setProductType(p)}
                  title={p === 'MIS' ? 'Intraday' : p === 'NRML' ? 'Carry Forward' : 'Delivery'}
                  className={`py-1.5 text-xs font-semibold rounded-md border transition-all ${
                    productType === p
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-slate-400'
                  }`}>{p}</button>
              ))}
            </div>
          </div>

          {/* ── Lots ── */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Lots</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLots(l => Math.max(1, l - 1))}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 font-bold text-base hover:bg-gray-50 hover:border-gray-300 transition flex items-center justify-center flex-shrink-0"
              >−</button>
              <input
                type="number" value={lots} min="1"
                onChange={e => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => setLots(l => l + 1)}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 font-bold text-base hover:bg-gray-50 hover:border-gray-300 transition flex items-center justify-center flex-shrink-0"
              >+</button>
            </div>
            <div className="flex justify-between items-center mt-1 px-0.5">
              <span className="text-xs text-gray-400 tabular-nums">{totalQty} qty</span>
              {estimatedValue && (
                <span className="text-xs font-semibold text-gray-600 tabular-nums">
                  ≈ ₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
          </div>

          {/* ── Price ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Price (₹)</label>
              {ltpReady && (
                <button onClick={() => setPrice(parseFloat(ltp.toFixed(2)))}
                  className="text-xs text-blue-500 font-semibold hover:text-blue-700 transition">
                  Use LTP ↗
                </button>
              )}
            </div>
            <input type="number" value={price || ''} step="0.05" min="0" placeholder="0.00"
              onChange={e => setPrice(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums" />
          </div>

          {/* ── Trigger price (SL only) ── */}
          {orderType === 'SL' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Trigger (₹)</label>
                {ltpReady && (
                  <button onClick={() => setTriggerPrice(parseFloat(ltp.toFixed(2)))}
                    className="text-xs text-blue-500 font-semibold hover:text-blue-700 transition">
                    Use LTP ↗
                  </button>
                )}
              </div>
              <input type="number" value={triggerPrice || ''} step="0.05" min="0" placeholder="0.00"
                onChange={e => setTriggerPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums" />
            </div>
          )}

          {/* ── Order result ── */}
          {result && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${
              result.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {result.success
                ? <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />
                : <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />}
              <span>{result.message}</span>
            </div>
          )}

          {/* ── Place Order button area ── */}
          <div className="mt-auto pt-1">
            {/* Case 1: Not connected to broker */}
            {!isConnected && (
              <div className="text-center text-xs text-gray-400 py-3 border border-dashed border-gray-200 rounded-xl">
                Connect to place orders
              </div>
            )}

            {/* Case 2: Connected but trading is DISABLED */}
            {isConnected && !isTradingEnabled && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex flex-col items-center gap-1.5 text-center">
                <div className="flex items-center gap-1.5 text-red-600">
                  <ShieldOff size={15} />
                  <span className="text-xs font-bold">Trading Deactivated</span>
                </div>
                <p className="text-xs text-red-500 leading-relaxed">
                  Order placement is disabled. Re-enable in Supabase to resume trading.
                </p>
              </div>
            )}

            {/* Case 3: Connected and trading is ENABLED — normal button */}
            {canPlaceOrder && (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={isLoading}
                className={`w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                  isBuy
                    ? 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700'
                    : 'bg-red-500 hover:bg-red-600 active:bg-red-700'
                }`}
              >
                {isLoading
                  ? <Loader2 size={15} className="animate-spin" />
                  : isBuy ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {isBuy ? 'BUY' : 'SELL'} {lots} LOT{lots > 1 ? 'S' : ''} · {totalQty} QTY
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {showConfirm && selectedScrip && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">

            <div className={`px-5 py-4 ${isBuy ? 'bg-emerald-500' : 'bg-red-500'}`}>
              <div className="flex items-center justify-between">
                <span className="text-white font-bold text-sm">{isBuy ? '▲ BUY' : '▼ SELL'} Order</span>
                <button onClick={() => setShowConfirm(false)} className="text-white/70 hover:text-white">
                  <X size={15} />
                </button>
              </div>
              <div className="text-white/80 text-xs mt-0.5">{getScripLabel()}</div>
            </div>

            <div className="px-5 py-2 divide-y divide-gray-100">
              {[
                ['Exchange',  (selectedScrip.p_exch_seg || '').toUpperCase()],
                ['Quantity',  `${totalQty} (${lots} lot${lots > 1 ? 's' : ''})`],
                ['Type',      orderType],
                ['Product',   productType],
                ['Price',     `₹${price}`],
                ...(orderType === 'SL' ? [['Trigger', `₹${triggerPrice}`]] : []),
                ...(ltpReady       ? [['LTP',       `₹${ltp.toFixed(2)}`]] : []),
                ...(estimatedValue ? [['Est. Value', `≈ ₹${estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-2 text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
                </div>
              ))}
            </div>

            <div className="px-5 pb-5 pt-3 grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowConfirm(false)} disabled={submitting}
                className="py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={handleConfirm} disabled={submitting}
                className={`py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition disabled:opacity-60 ${
                  isBuy ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {submitting && <Loader2 size={13} className="animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}