// src/lib/services/MarketDataService.ts
//
// Collects ±5 ATM strikes (OI, OI_chg, IV, Greeks, Buildup, OHLC 5m candle)
// + HDFCBANK & Reliance (LTP, EMA9, EMA21) from Kotak quotesService.
// Saves every snapshot to Supabase market_snapshots table.
// Feeds structured JSON to GeminiService on candle close and in Trade Mode.
//
// NIFTY LTP is NOT fetched here — it comes from TradingPanel via setNiftyLTP()
// because the NIFTY index token (26000) is only available via WebSocket,
// not the quotes REST API.
//
// ⚠️  Replace HDFCBANK_SYMBOL and RELIANCE_SYMBOL below with the correct
//     p_symbol values from your scrip_master table once confirmed.

import { quotesService } from '@/lib/services/QuotesService';
import { supabase } from '@/lib/supabase/client';
import { GeminiService, MarketSnapshot, OptionStrikeData } from '@/lib/services/GeminiService';

// ─── Constants ────────────────────────────────────────────────────────────────
// Replace these with actual p_symbol values from scrip_master WHERE segment='nse_cm'
// Run: SELECT p_symbol, p_trd_symbol FROM scrip_master WHERE segment='nse_cm' AND p_trd_symbol ILIKE '%HDFC%'
const HDFCBANK_TOKEN = '1333';   // HDFCBANK, nse_cm
const RELIANCE_TOKEN = '2885';   // RELIANCE, nse_cm

const STRIKE_STEP    = 50;
const RISK_FREE_RATE = 0.065;
const CANDLE_MINUTES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  open: number; high: number; low: number; close: number;
  volume: number; openMs: number;
}

interface EMAState {
  ema9: number; ema21: number; count: number;
}

// ─── Black-Scholes ────────────────────────────────────────────────────────────

function normCDF(x: number): number {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: 'CE' | 'PE'): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, type === 'CE' ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === 'CE') return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

function calcIV(price: number, S: number, K: number, T: number, r: number, type: 'CE' | 'PE'): number | null {
  if (price <= 0 || S <= 0 || K <= 0 || T <= 0) return null;
  const intrinsic = Math.max(0, type === 'CE' ? S - K : K - S);
  if (price < intrinsic) return null;
  let lo = 0.001, hi = 20, mid = 0;
  for (let i = 0; i < 100; i++) {
    mid = (lo + hi) / 2;
    const diff = bsPrice(S, K, T, r, mid, type) - price;
    if (Math.abs(diff) < 1e-6) return mid;
    if (diff > 0) hi = mid; else lo = mid;
  }
  return mid > 0.001 ? mid : null;
}

function calcGreeks(S: number, K: number, T: number, r: number, sigma: number, type: 'CE' | 'PE') {
  if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  const sqrtT  = Math.sqrt(T);
  const d1     = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2     = d1 - sigma * sqrtT;
  const pdf_d1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const delta  = type === 'CE' ? normCDF(d1) : normCDF(d1) - 1;
  const gamma  = pdf_d1 / (S * sigma * sqrtT);
  const theta  = type === 'CE'
    ? (-(S * pdf_d1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCDF(d2)) / 365
    : (-(S * pdf_d1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365;
  const vega   = S * pdf_d1 * sqrtT / 100;
  return { delta, gamma, theta, vega };
}

function timeToExpiryYears(expiryTs: number): number {
  const msLeft = expiryTs * 1000 - Date.now();
  return Math.max(msLeft / 86400000, 1 / 365) / 365;
}

// ─── EMA ──────────────────────────────────────────────────────────────────────

function updateEMA(state: EMAState, price: number): EMAState {
  if (state.count === 0) return { ema9: price, ema21: price, count: 1 };
  const k9  = 2 / 10, k21 = 2 / 22;
  return {
    ema9:  price * k9  + state.ema9  * (1 - k9),
    ema21: price * k21 + state.ema21 * (1 - k21),
    count: state.count + 1,
  };
}

// ─── Buildup ──────────────────────────────────────────────────────────────────

type BuildupLabel = 'Long Buildup' | 'Short Buildup' | 'Long Unwind' | 'Short Cover' | 'Neutral';

function classifyBuildup(priceDelta: number, oiDelta: number): BuildupLabel {
  if (priceDelta > 0 && oiDelta > 0) return 'Long Buildup';
  if (priceDelta < 0 && oiDelta > 0) return 'Short Buildup';
  if (priceDelta < 0 && oiDelta < 0) return 'Long Unwind';
  if (priceDelta > 0 && oiDelta < 0) return 'Short Cover';
  return 'Neutral';
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export class MarketDataService {
  private gemini:          GeminiService;
  private latestNiftyLTP:  number = 0;

  private candles    = new Map<string, Candle>();
  private emaStates  = new Map<string, EMAState>();
  private ltpPrev    = new Map<string, number>();
  private oiPrev     = new Map<string, number>();

  private candleIntervalId:    ReturnType<typeof setInterval> | null = null;
  private tradeModeIntervalId: ReturnType<typeof setInterval> | null = null;
  private _isTradeMode = false;

  private onSnapshot?: (s: MarketSnapshot) => void;
  private onAnalysis?: (a: string) => void;
  private onError?:   (e: string) => void;

  constructor(geminiApiKey: string) {
    this.gemini = new GeminiService(geminiApiKey);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  setCallbacks(cbs: {
    onSnapshot?: (s: MarketSnapshot) => void;
    onAnalysis?: (a: string) => void;
    onError?:    (e: string) => void;
  }) {
    this.onSnapshot = cbs.onSnapshot;
    this.onAnalysis = cbs.onAnalysis;
    this.onError    = cbs.onError;
  }

  /** Feed NIFTY LTP from TradingPanel's WebSocket — no REST call needed */
  setNiftyLTP(ltp: number) {
    if (ltp > 1000) this.latestNiftyLTP = ltp;
  }

  get tradeModeActive() { return this._isTradeMode; }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  start() {
    if (this.candleIntervalId) return;
    console.log('[MarketDataService] Starting 5m candle engine');
    const msIn5min  = CANDLE_MINUTES * 60 * 1000;
    const now       = Date.now();
    const nextClose = Math.ceil(now / msIn5min) * msIn5min;
    const delay     = nextClose - now;
    console.log(`[MarketDataService] First candle close in ${Math.round(delay / 1000)}s`);
    setTimeout(() => {
      this.onCandleClose();
      this.candleIntervalId = setInterval(() => this.onCandleClose(), msIn5min);
    }, delay);
  }

  stop() {
    if (this.candleIntervalId)    { clearInterval(this.candleIntervalId);    this.candleIntervalId    = null; }
    if (this.tradeModeIntervalId) { clearInterval(this.tradeModeIntervalId); this.tradeModeIntervalId = null; }
    this._isTradeMode = false;
    console.log('[MarketDataService] Stopped');
  }

  startTradeMode() {
    if (this._isTradeMode) return;
    this._isTradeMode        = true;
    this.tradeModeIntervalId = setInterval(() => this.collectAndSend('trade_mode'), 10_000);
    console.log('[MarketDataService] 🔴 Trade Mode ON — feeding every 10s');
  }

  stopTradeMode() {
    if (!this._isTradeMode) return;
    this._isTradeMode = false;
    if (this.tradeModeIntervalId) { clearInterval(this.tradeModeIntervalId); this.tradeModeIntervalId = null; }
    console.log('[MarketDataService] ⚫ Trade Mode OFF');
  }

  toggleTradeMode(): boolean {
    if (this._isTradeMode) { this.stopTradeMode(); return false; }
    else                   { this.startTradeMode(); return true;  }
  }

  async triggerNow(): Promise<MarketSnapshot | null> {
    return this.collectAndSend('candle_close');
  }

  // ── Core ─────────────────────────────────────────────────────────────────────

  private async onCandleClose() {
    console.log('[MarketDataService] 🕯 5m candle closed — collecting snapshot');
    await this.collectAndSend('candle_close');
  }

  async collectAndSend(mode: 'candle_close' | 'trade_mode'): Promise<MarketSnapshot | null> {
    try {
      const snapshot = await this.buildSnapshot(mode);
      if (!snapshot) return null;
      await this.saveSnapshot(snapshot);
      this.onSnapshot?.(snapshot);
      const analysis = await this.gemini.analyze(snapshot);
      if (analysis) this.onAnalysis?.(analysis);
      return snapshot;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MarketDataService] collectAndSend error:', msg);
      this.onError?.(msg);
      return null;
    }
  }

  // ── Snapshot builder ──────────────────────────────────────────────────────────

  private async buildSnapshot(mode: 'candle_close' | 'trade_mode'): Promise<MarketSnapshot | null> {
    const niftyLTP = this.latestNiftyLTP;
    if (!niftyLTP || niftyLTP < 1000) {
      console.warn('[MarketDataService] NIFTY LTP not available yet — call setNiftyLTP() first');
      return null;
    }

    const atm = Math.round(niftyLTP / STRIKE_STEP) * STRIKE_STEP;

    // Fetch HDFCBANK + Reliance via quotesService (numeric tokens, nse_cm)
    const ltpMap = await quotesService.getBatchLTP([
      { segment: 'nse_cm', symbol: HDFCBANK_TOKEN },
      { segment: 'nse_cm', symbol: RELIANCE_TOKEN },
    ]);

    const hdfcLTP = ltpMap.get(HDFCBANK_TOKEN) ?? 0;
    const relLTP  = ltpMap.get(RELIANCE_TOKEN)  ?? 0;

    console.log(`[MarketDataService] Equities — HDFC: ₹${hdfcLTP}  REL: ₹${relLTP}`);

    const hdfcEMA = this.updateSymbolEMA('HDFCBANK', hdfcLTP);
    const relEMA  = this.updateSymbolEMA('RELIANCE', relLTP);

    // Get ±5 ATM strikes from Supabase
    const strikes = await this.getATMStrikes(atm);
    if (!strikes.length) {
      console.warn('[MarketDataService] No strikes found for ATM', atm);
    }

    // Fetch option LTPs + compute IV/Greeks/Buildup
    const optionData = strikes.length
      ? await this.fetchOptionData(strikes, niftyLTP)
      : [];

    const niftyCandle = this.updateCandle('NIFTY', niftyLTP, 0);

    return {
      timestamp:    new Date().toISOString(),
      mode,
      nifty_ltp:    niftyLTP,
      atm_strike:   atm,
      nifty_candle: niftyCandle,
      options:      optionData,
      hdfcbank:     { ltp: hdfcLTP, ema9: hdfcEMA.ema9, ema21: hdfcEMA.ema21 },
      reliance:     { ltp: relLTP,  ema9: relEMA.ema9,  ema21: relEMA.ema21  },
    };
  }

  // ── EMA ───────────────────────────────────────────────────────────────────────

  private updateSymbolEMA(symbol: string, price: number): EMAState {
    const prev = this.emaStates.get(symbol) ?? { ema9: price, ema21: price, count: 0 };
    const next = updateEMA(prev, price);
    this.emaStates.set(symbol, next);
    return next;
  }

  // ── Candle builder ────────────────────────────────────────────────────────────

  private updateCandle(symbol: string, ltp: number, volume: number): Candle {
    const msIn5min = CANDLE_MINUTES * 60 * 1000;
    const now      = Date.now();
    const candleMs = Math.floor(now / msIn5min) * msIn5min;
    const existing = this.candles.get(symbol);

    if (!existing || existing.openMs !== candleMs) {
      const c: Candle = { open: ltp, high: ltp, low: ltp, close: ltp, volume, openMs: candleMs };
      this.candles.set(symbol, c);
      return c;
    }
    existing.high    = Math.max(existing.high, ltp);
    existing.low     = Math.min(existing.low,  ltp);
    existing.close   = ltp;
    existing.volume += volume;
    return { ...existing };
  }

  // ── Supabase strike lookup ────────────────────────────────────────────────────

  private async getATMStrikes(atm: number): Promise<Array<{
    symbol: string; token: string; strike: number; type: 'CE' | 'PE'; expiryTs: number;
  }>> {
    try {
      const strikeMin = atm - 5 * STRIKE_STEP;
      const strikeMax = atm + 5 * STRIKE_STEP;

      // ── Step 1: Try Supabase with current expiry ──────────────────────────
      const nowTs = Math.floor(Date.now() / 1000);
      const { data: expiryRows } = await supabase
        .from('scrip_master')
        .select('l_expiry_date')
        .ilike('p_trd_symbol', 'NIFTY2%CE')
        .eq('segment', 'nse_fo')
        .gte('l_expiry_date', nowTs)
        .order('l_expiry_date', { ascending: true })
        .limit(1);

      let rows: any[] | null = null;
      let expiryTs = 0;

      if (expiryRows?.length) {
        expiryTs = expiryRows[0].l_expiry_date;
        const { data } = await supabase
          .from('scrip_master')
          .select('p_trd_symbol, p_symbol, p_tok, l_expiry_date')
          .eq('segment', 'nse_fo')
          .eq('l_expiry_date', expiryTs);
        rows = data;
      }

      // ── Step 2: Fallback — same as OptionsChain hardcoded expiry pattern ──
      // Build nearest Thursday expiry code: YYMDD e.g. "26310" for 10 Mar 2026
      if (!rows?.length) {
        const now   = new Date();
        const yy    = String(now.getFullYear()).slice(2);
        const mm    = String(now.getMonth() + 1);   // no padding, Kotak uses single digit month
        const dd    = String(now.getDate()).padStart(2, '0');
        const expiryCode = `${yy}${mm}${dd}`;
        console.log(`[MarketDataService] Falling back to expiry pattern NIFTY${expiryCode}%`);

        const { data } = await supabase
          .from('scrip_master')
          .select('p_trd_symbol, p_symbol, p_tok, l_expiry_date')
          .ilike('p_trd_symbol', `NIFTY${expiryCode}%`)
          .eq('segment', 'nse_fo');
        rows = data;

        // If still nothing, try next 3 Thursdays
        if (!rows?.length) {
          const d = new Date();
          for (let week = 0; week < 4 && !rows?.length; week++) {
            // Advance to next Thursday
            d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7));
            const tyy = String(d.getFullYear()).slice(2);
            const tmm = String(d.getMonth() + 1);
            const tdd = String(d.getDate()).padStart(2, '0');
            const code = `${tyy}${tmm}${tdd}`;
            console.log(`[MarketDataService] Trying expiry code NIFTY${code}%`);
            const { data: d2 } = await supabase
              .from('scrip_master')
              .select('p_trd_symbol, p_symbol, p_tok, l_expiry_date')
              .ilike('p_trd_symbol', `NIFTY${code}%`)
              .eq('segment', 'nse_fo');
            if (d2?.length) rows = d2;
          }
        }
      }

      if (!rows?.length) {
        console.warn('[MarketDataService] getATMStrikes: no rows found in scrip_master');
        return [];
      }

      // ── Step 3: Filter ±5 strikes and build result ─────────────────────────
      const result: Array<{ symbol: string; token: string; strike: number; type: 'CE' | 'PE'; expiryTs: number }> = [];

      for (const row of rows) {
        const m = (row.p_trd_symbol || '').match(/(\d{4,6})(CE|PE)$/i);
        if (!m) continue;
        const strike = parseInt(m[1], 10);
        if (strike < strikeMin || strike > strikeMax) continue;
        result.push({
          symbol:   row.p_trd_symbol,
          token:    row.p_symbol,   // p_symbol is what QuotesService/OptionsChain uses
          strike,
          type:     m[2].toUpperCase() as 'CE' | 'PE',
          expiryTs: row.l_expiry_date ?? expiryTs,
        });
      }

      console.log(`[MarketDataService] getATMStrikes: found ${result.length} strikes around ATM ${atm}`);
      return result.sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type));
    } catch (err) {
      console.error('[MarketDataService] getATMStrikes error:', err);
      return [];
    }
  }

  // ── Options data ──────────────────────────────────────────────────────────────

  private async fetchOptionData(
    strikes: Array<{ symbol: string; token: string; strike: number; type: 'CE' | 'PE'; expiryTs: number }>,
    niftyLTP: number
  ): Promise<OptionStrikeData[]> {
    const queries  = strikes.map(s => ({ segment: 'nse_fo', symbol: s.token }));
    const ltpMap   = await quotesService.getBatchLTP(queries);
    const ivByStrike = new Map<number, { CE?: number; PE?: number }>();

    // Pass 1: IV per strike
    for (const s of strikes) {
      const ltp = ltpMap.get(s.token) ?? ltpMap.get(s.symbol) ?? 0;
      if (!ltp) continue;
      const T  = timeToExpiryYears(s.expiryTs);
      const iv = calcIV(ltp, niftyLTP, s.strike, T, RISK_FREE_RATE, s.type);
      if (iv !== null) {
        if (!ivByStrike.has(s.strike)) ivByStrike.set(s.strike, {});
        ivByStrike.get(s.strike)![s.type] = iv;
      }
    }

    // Pass 2: full OptionStrikeData
    const results: OptionStrikeData[] = [];
    for (const s of strikes) {
      const ltp        = ltpMap.get(s.token) ?? ltpMap.get(s.symbol) ?? 0;
      const T          = timeToExpiryYears(s.expiryTs);
      const iv         = calcIV(ltp, niftyLTP, s.strike, T, RISK_FREE_RATE, s.type) ?? 0;
      const greeks     = iv > 0 ? calcGreeks(niftyLTP, s.strike, T, RISK_FREE_RATE, iv, s.type) : { delta: 0, gamma: 0, theta: 0, vega: 0 };
      const prevLTP    = this.ltpPrev.get(s.symbol) ?? ltp;
      const priceDelta = ltp - prevLTP;
      this.ltpPrev.set(s.symbol, ltp);
      const prevOI     = this.oiPrev.get(s.symbol) ?? 0;
      const buildup    = classifyBuildup(priceDelta, 0 - prevOI); // OI delta 0 until full quote available
      const candle     = this.updateCandle(s.symbol, ltp, 0);
      const strikeIVs  = ivByStrike.get(s.strike) ?? {};
      const ivSkewPct  = ((strikeIVs.PE ?? 0) - (strikeIVs.CE ?? 0)) * 100;

      results.push({
        symbol:        s.symbol,
        strike:        s.strike,
        type:          s.type,
        ltp,
        oi:            0,
        oi_change:     0,
        oi_change_pct: 0,
        volume:        0,
        iv:            iv * 100,
        iv_skew:       ivSkewPct,
        delta:         greeks.delta,
        gamma:         greeks.gamma,
        theta:         greeks.theta,
        vega:          greeks.vega,
        buildup,
        candle_5m:     candle,
      });
    }
    return results;
  }

  // ── Persist to Supabase ───────────────────────────────────────────────────────

  private async saveSnapshot(snapshot: MarketSnapshot): Promise<void> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('market_snapshots').insert({
        user_id:        userData.user?.id ?? null,
        timestamp:      snapshot.timestamp,
        mode:           snapshot.mode,
        nifty_ltp:      snapshot.nifty_ltp,
        atm_strike:     snapshot.atm_strike,
        hdfcbank_ltp:   snapshot.hdfcbank.ltp,
        hdfcbank_ema9:  snapshot.hdfcbank.ema9,
        hdfcbank_ema21: snapshot.hdfcbank.ema21,
        reliance_ltp:   snapshot.reliance.ltp,
        reliance_ema9:  snapshot.reliance.ema9,
        reliance_ema21: snapshot.reliance.ema21,
        options_data:   JSON.stringify(snapshot.options),
        candle_5m:      JSON.stringify(snapshot.nifty_candle),
      });
      if (error) console.error('[MarketDataService] saveSnapshot error:', error);
      else       console.log('[MarketDataService] ✅ Snapshot saved');
    } catch (err) {
      console.error('[MarketDataService] saveSnapshot exception:', err);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: MarketDataService | null = null;

export function getMarketDataService(geminiApiKey?: string): MarketDataService {
  if (!_instance) {
    if (!geminiApiKey) throw new Error('geminiApiKey required on first call');
    _instance = new MarketDataService(geminiApiKey);
  }
  return _instance;
}