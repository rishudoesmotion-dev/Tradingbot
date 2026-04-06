

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RANGE = 5;
const MAX_RANGE     = 10;
const DEFAULT_RATE  = 0.065;
const STRIKE_STEP   = 50;

// ─── Black-Scholes ────────────────────────────────────────────────────────────

function normCdf(x: number): number {
  const p = 0.3275911;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x) / Math.sqrt(2));
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t
            * Math.exp(-(x * x) / 2);
  return 0.5 * (1.0 + sign * y);
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: 'CE' | 'PE') {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: type === 'CE' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1    = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2    = d1 - sigma * sqrtT;
  const Kert  = K * Math.exp(-r * T);
  const price = type === 'CE'
    ? S * normCdf(d1) - Kert * normCdf(d2)
    : Kert * normCdf(-d2) - S * normCdf(-d1);
  const delta        = type === 'CE' ? normCdf(d1) : normCdf(d1) - 1;
  const gamma        = normPdf(d1) / (S * sigma * sqrtT);
  const thetaAnnual  = type === 'CE'
    ? -(S * normPdf(d1) * sigma) / (2 * sqrtT) - r * Kert * normCdf(d2)
    : -(S * normPdf(d1) * sigma) / (2 * sqrtT) + r * Kert * normCdf(-d2);
  return { price, delta, gamma, theta: thetaAnnual / 365, vega: S * normPdf(d1) * sqrtT / 100 };
}

function calcIV(market: number, S: number, K: number, T: number, r: number, type: 'CE' | 'PE'): number | null {
  if (market <= 0 || S <= 0 || K <= 0 || T <= 0) return null;
  const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S);
  if (market < intrinsic) return null;
  const MIN_IV = 0.001, MAX_IV = 20.0, TOL = 1e-6, MAX_IT = 100;
  const f = (s: number) => bsPrice(S, K, T, r, s, type).price - market;
  if (f(MIN_IV) * f(MAX_IV) > 0) return null;
  let a = MIN_IV, b = MAX_IV, fa = f(a), c = a, fc = fa, d = 0, mflag = true;
  for (let i = 0; i < MAX_IT; i++) {
    if (Math.abs(b - a) < TOL) break;
    const fb = f(b);
    let s: number;
    if (fa !== fc && fb !== fc) {
      s = (a * fb * fc) / ((fa - fb) * (fa - fc))
        + (b * fa * fc) / ((fb - fa) * (fb - fc))
        + (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      s = b - fb * (b - a) / (fb - fa);
    }
    const cond = s < (3 * a + b) / 4 || s > b
      || (mflag && Math.abs(s - b) >= Math.abs(b - c) / 2)
      || (!mflag && Math.abs(s - b) >= Math.abs(c - d) / 2)
      || (mflag && Math.abs(b - c) < TOL)
      || (!mflag && Math.abs(c - d) < TOL);
    if (cond) { s = (a + b) / 2; mflag = true; } else { mflag = false; }
    d = c; c = b; fc = fb;
    const fs = f(s);
    if (fa * fs < 0) b = s; else { a = s; fa = fs; }
    if (Math.abs(f(a)) < Math.abs(f(b))) { [a, b] = [b, a]; fa = f(a); }
  }
  return b > MIN_IV && b < MAX_IV ? b : null;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function roundToNearest50(n: number) {
  return Math.round(n / STRIKE_STEP) * STRIKE_STEP;
}

function getStrikeAndType(
  row: any, strikeCol: string | null, optTypeCol: string | null
): { strike: number; optType: 'CE' | 'PE' } | null {
  let strike: number | null = null;
  let optType: string | null = null;

  if (strikeCol) {
    const raw = parseFloat(String(row[strikeCol] ?? 0));
    if (raw >= 10_000 && raw <= 35_000) strike = raw;
  }
  if (optTypeCol) {
    const val = String(row[optTypeCol] ?? '').toUpperCase().trim();
    if (val === 'CE' || val === 'PE') optType = val;
  }

  if (!strike || !optType) {
    const sym = (row.p_trd_symbol || '').toUpperCase();
    const tm  = sym.match(/(CE|PE)$/);
    if (tm) {
      if (!optType) optType = tm[1];
      const body = sym.replace(/^NIFTY/, '').replace(/(CE|PE)$/, '');
      const candidates: number[] = [];
      for (let len = 4; len <= 6; len++) {
        if (body.length > len) {
          const s = parseInt(body.slice(-len), 10);
          if (s >= 10_000 && s <= 35_000) candidates.push(s);
        }
      }
      const am = sym.match(/[A-Z]{3}\d{0,4}?(\d{4,6})(CE|PE)$/);
      if (am) { const s = parseInt(am[1], 10); if (s >= 10_000 && s <= 35_000) candidates.push(s); }
      if (!strike && candidates.length > 0) {
        strike = candidates.reduce((b, c) => Math.abs(c - 22_500) < Math.abs(b - 22_500) ? c : b);
      }
    }
  }
  if (!strike || !optType) return null;
  return { strike, optType: optType as 'CE' | 'PE' };
}

/** Resolve nearest valid expiry from Supabase, then fetch its scrip rows */
async function resolveExpiryAndFetchRows(hintTs: number | null): Promise<{ resolvedTs: number; rows: any[] } | null> {
  const nowTs = Math.floor(Date.now() / 1000);

  const { data: expData, error } = await supabase
    .from('scrip_master')
    .select('l_expiry_date')
    .eq('p_symbol', 'NIFTY')
    .eq('segment',  'nse_fo')
    .gte('l_expiry_date', nowTs)
    .order('l_expiry_date', { ascending: true });

  if (error || !expData?.length) return null;

  const allTs      = Array.from(new Set(expData.map((r: any) => r.l_expiry_date as number)));
  const resolvedTs = hintTs
    ? allTs.reduce((best, ts) => Math.abs(ts - hintTs) < Math.abs(best - hintTs) ? ts : best)
    : allTs[0];

  const { data: rows, error: rowErr } = await supabase
    .from('scrip_master')
    .select('*')
    .eq('p_symbol',      'NIFTY')
    .eq('segment',       'nse_fo')
    .eq('l_expiry_date', resolvedTs);

  if (rowErr || !rows?.length) return null;
  return { resolvedTs, rows };
}

// ─── Kotak bulk quote fetcher ─────────────────────────────────────────────────
// Calls /api/kotak/quotes proxy directly with session params.
// This bypasses the quotesService singleton which has no session server-side.

interface KotakSession {
  tradingToken: string;
  tradingSid:   string;
  baseUrl:      string;
  consumerKey:  string;
}

async function fetchKotakQuotes(
  tokens:  Array<{ segment: string; symbol: string }>,
  session: KotakSession,
  baseOrigin: string,
): Promise<any[]> {
  if (!tokens.length) return [];

  const params = new URLSearchParams({
    queries:      JSON.stringify(tokens),
    filter:       'all',
    tradingToken: session.tradingToken,
    tradingSid:   session.tradingSid,
    baseUrl:      session.baseUrl,
    consumerKey:  session.consumerKey,
  });

  const url = `${baseOrigin}/api/kotak/quotes?${params.toString()}`;

  try {
    const res  = await fetch(url, { headers: { 'Cache-Control': 'no-store' } });
    const json = await res.json();
    if (!json.success) {
      console.error('[option-chain] Kotak proxy error:', json.error);
      return [];
    }
    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    console.error('[option-chain] fetchKotakQuotes failed:', err);
    return [];
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp    = req.nextUrl.searchParams;
  const spot  = parseFloat(sp.get('spot')  ?? '');
  const range = Math.min(MAX_RANGE, Math.max(1, parseInt(sp.get('range') ?? String(DEFAULT_RANGE), 10)));
  const rate  = parseFloat(sp.get('rate')  ?? String(DEFAULT_RATE));
  const hintTs = sp.get('expiry') ? parseInt(sp.get('expiry')!, 10) : null;

  // ── Validate spot ─────────────────────────────────────────────────────────
  if (!spot || isNaN(spot) || spot < 1_000)
    return NextResponse.json({ status: 'error', message: 'Missing or invalid `spot` price' }, { status: 400 });

  // ── Read Kotak session from headers ───────────────────────────────────────
  // Client must forward these from localStorage on every poll request.
  const tradingToken = req.headers.get('x-trading-token');
  const tradingSid   = req.headers.get('x-trading-sid');
  const baseUrl      = req.headers.get('x-base-url');
  const consumerKey  = req.headers.get('x-consumer-key');

  const hasSession   = !!(tradingToken && tradingSid && baseUrl && consumerKey);

  if (!hasSession) {
    return NextResponse.json({
      status:  'error',
      message: 'Missing Kotak session headers. Forward x-trading-token, x-trading-sid, x-base-url, x-consumer-key from localStorage.',
    }, { status: 401 });
  }

  const session: KotakSession = { tradingToken: tradingToken!, tradingSid: tradingSid!, baseUrl: baseUrl!, consumerKey: consumerKey! };
  // Origin for internal proxy call (e.g. http://localhost:3000 or https://yourdomain.com)
  const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const atmStrike = roundToNearest50(spot);

  try {
    // ── 1. Resolve expiry + scrip rows from Supabase ──────────────────────
    const resolved = await resolveExpiryAndFetchRows(hintTs);
    if (!resolved)
      return NextResponse.json({ status: 'error', message: 'No NIFTY FO scrips found in scrip_master' }, { status: 404 });

    const { resolvedTs, rows } = resolved;
    const daysLeft  = Math.max((resolvedTs - Math.floor(Date.now() / 1000)) / 86_400, 0.001);
    const tte       = daysLeft / 365;
    const expiryDate = new Date(resolvedTs * 1000).toISOString().slice(0, 10);

    // ── 2. Detect schema + lot size ───────────────────────────────────────
    const cols       = Object.keys(rows[0]);
    const strikeCol  = cols.find(c => c === 'l_strike_price') ?? cols.find(c => c === 'strike_price') ?? cols.find(c => c.toLowerCase().includes('strike')) ?? null;
    const optTypeCol = cols.find(c => c === 'p_option_type')  ?? cols.find(c => c === 'option_type')  ?? cols.find(c => c.toLowerCase().includes('option')) ?? null;
    const lotSize    = rows.find((r: any) => (r.l_lot_size ?? 0) > 0)?.l_lot_size ?? 75;

    // ── 3. ATM ± range strike selection ───────────────────────────────────
    const allStrikes = Array.from(new Set(
      rows.map((r: any) => getStrikeAndType(r, strikeCol, optTypeCol)?.strike).filter((s): s is number => !!s)
    )).sort((a, b) => a - b);

    if (!allStrikes.length)
      return NextResponse.json({ status: 'error', message: 'Could not parse strikes from scrip data' }, { status: 500 });

    const atmIdx     = allStrikes.reduce((bi, s, i) => Math.abs(s - atmStrike) < Math.abs(allStrikes[bi] - atmStrike) ? i : bi, 0);
    const visibleSet = new Set(
      allStrikes.slice(Math.max(0, atmIdx - range), Math.min(allStrikes.length - 1, atmIdx + range) + 1)
    );

    // ── 4. Build strike → { ce, pe } scrip map ────────────────────────────
    const strikeMap = new Map<number, { ce?: any; pe?: any }>();
    rows.forEach((row: any) => {
      const parsed = getStrikeAndType(row, strikeCol, optTypeCol);
      if (!parsed || !visibleSet.has(parsed.strike)) return;
      if (!strikeMap.has(parsed.strike)) strikeMap.set(parsed.strike, {});
      const entry = strikeMap.get(parsed.strike)!;
      if (parsed.optType === 'CE') entry.ce = row; else entry.pe = row;
    });

    // ── 5. Collect token refs ─────────────────────────────────────────────
    type TokenRef = { strike: number; side: 'ce' | 'pe'; tok: string; scripRow: any };
    const tokenRefs: TokenRef[] = [];
    strikeMap.forEach((entry, strike) => {
      if (entry.ce) tokenRefs.push({ strike, side: 'ce', tok: String(entry.ce.p_tok ?? entry.ce.p_symbol ?? ''), scripRow: entry.ce });
      if (entry.pe) tokenRefs.push({ strike, side: 'pe', tok: String(entry.pe.p_tok ?? entry.pe.p_symbol ?? ''), scripRow: entry.pe });
    });

    // ── 6. Bulk fetch live quotes from Kotak Neo ──────────────────────────
    //
    // Kotak Neo /all response fields (from bot.py parse_item + QuotesService):
    //   ltp / ltP / lp / last_price  → last traded price
    //   open_int                      → open interest
    //   last_volume                   → volume
    //   ohlc.{ open, high, low, close }
    //   depth.buy[] / depth.sell[]    → [{ price, quantity, orders }, ...]
    //   average_price                 → avg traded price
    //
    const quotes = await fetchKotakQuotes(
      tokenRefs.map(t => ({ segment: 'nse_fo', symbol: t.tok })),
      session,
      origin,
    );

    // Map index → quote (Kotak returns in same order as request)
    const quoteMap = new Map<string, any>();
    quotes.forEach((q: any, i: number) => {
      if (tokenRefs[i]) quoteMap.set(tokenRefs[i].tok, q);
    });

    // ── 7. Assemble OC ────────────────────────────────────────────────────

    const parseLeg = (tok: string, scripRow: any, strike: number, optType: 'CE' | 'PE') => {
      const q = quoteMap.get(tok) ?? {};

      const ltp    = parseFloat(String(q.ltp ?? q.ltP ?? q.lp ?? q.last_price ?? 0)) || 0;
      const oi     = parseInt(String(q.open_int   ?? q.oi     ?? 0), 10) || 0;
      const vol    = parseInt(String(q.last_volume ?? q.volume ?? 0), 10) || 0;
      const avgPx  = parseFloat(String(q.average_price ?? 0)) || 0;
      const prevCl = parseFloat(String(q.ohlc?.close ?? q.close ?? 0)) || 0;
      const ohlcR  = q.ohlc ?? {};
      const buyLvl  = (q.depth?.buy  ?? [])[0] ?? {};
      const sellLvl = (q.depth?.sell ?? [])[0] ?? {};

      const iv = ltp > 0 ? calcIV(ltp, spot, strike, tte, rate, optType) : null;
      let greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
      if (iv !== null) {
        const bs = bsPrice(spot, strike, tte, rate, iv, optType);
        greeks = { delta: +bs.delta.toFixed(5), gamma: +bs.gamma.toFixed(5), theta: +bs.theta.toFixed(5), vega: +bs.vega.toFixed(5) };
      }

      return {
        security_id:          parseInt(String(scripRow?.p_tok ?? tok), 10) || null,
        last_price:           ltp,
        average_price:        avgPx,
        previous_close_price: prevCl,
        oi,
        volume:               vol,
        top_bid_price:        parseFloat(String(buyLvl.price     ?? 0)) || 0,
        top_bid_quantity:     parseInt(  String(buyLvl.quantity  ?? 0), 10) || 0,
        top_ask_price:        parseFloat(String(sellLvl.price    ?? 0)) || 0,
        top_ask_quantity:     parseInt(  String(sellLvl.quantity ?? 0), 10) || 0,
        implied_volatility:   iv !== null ? +(iv * 100).toFixed(6) : null,
        greeks,
        ohlc: {
          open:  parseFloat(String(ohlcR.open  ?? 0)) || 0,
          high:  parseFloat(String(ohlcR.high  ?? 0)) || 0,
          low:   parseFloat(String(ohlcR.low   ?? 0)) || 0,
          close: parseFloat(String(ohlcR.close ?? 0)) || 0,
        },
      };
    };

    const oc: Record<string, { ce?: object; pe?: object }> = {};
    strikeMap.forEach((entry, strike) => {
      const key = strike.toFixed(6);
      oc[key] = {};
      if (entry.ce) oc[key].ce = parseLeg(String(entry.ce.p_tok ?? entry.ce.p_symbol ?? ''), entry.ce, strike, 'CE');
      if (entry.pe) oc[key].pe = parseLeg(String(entry.pe.p_tok ?? entry.pe.p_symbol ?? ''), entry.pe, strike, 'PE');
    });

    // ── 8. Return ─────────────────────────────────────────────────────────
    return NextResponse.json(
      { status: 'success', data: { last_price: spot, atm_strike: atmStrike, lot_size: lotSize, expiry: resolvedTs, expiry_date: expiryDate, updated_at: new Date().toISOString(), oc } },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );

  } catch (err: any) {
    console.error('[/api/option-chain] error:', err);
    return NextResponse.json({ status: 'error', message: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}