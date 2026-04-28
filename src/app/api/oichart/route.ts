import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── In-memory OI history ─────────────────────────────────────────────────────
// Persists across requests within the same Node.js process (dev + prod single instance).
// Key: `${strike}-${type}`  Value: sorted array of snapshots
const oiHistory = new Map<
  string,
  Array<{ timestamp: number; oi: number; ltp: number; volume: number }>
>();
const MAX_HISTORY = 375; // 6h 15min @ 1 snapshot/min

function pushToHistory(
  key: string,
  point: { timestamp: number; oi: number; ltp: number; volume: number }
) {
  const arr = oiHistory.get(key) ?? [];
  // Skip duplicates (same minute)
  if (arr.length > 0 && arr[arr.length - 1].timestamp === point.timestamp) return;
  arr.push(point);
  if (arr.length > MAX_HISTORY) arr.shift();
  oiHistory.set(key, arr);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OIDataPoint {
  timestamp: number;
  strike: number;
  type: 'CE' | 'PE';
  oi: number;
  ltp: number;
  volume: number;
}

interface ShortCoveringAlert {
  id: string;
  timestamp: number;
  strike: number;
  type: 'CE' | 'PE';
  symbol: string;
  priceChange: number;
  volumeChange: number;
  oiChange: number;
  description: string;
}

interface KotakSession {
  tradingToken: string;
  tradingSid: string;
  baseUrl: string;
  consumerKey: string;
}

// ─── Resolve option symbols from scrip_master ─────────────────────────────────

async function resolveSymbols(
  strikes: number[],
  expiryTs?: number
): Promise<Array<{ strike: number; type: 'CE' | 'PE'; symbol: string; token: string }>> {
  // Find nearest upcoming expiry
  const todayMidnight = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  const { data: expData, error: expErr } = await supabase
    .from('scrip_master')
    .select('l_expiry_date')
    .eq('p_symbol', 'NIFTY')
    .eq('segment', 'nse_fo')
    .gte('l_expiry_date', todayMidnight)
    .order('l_expiry_date', { ascending: true });

  if (expErr || !expData?.length) {
    console.error('[OI API] resolveSymbols: no expiries found', expErr);
    return [];
  }

  const allTs = Array.from(new Set(expData.map((r: any) => r.l_expiry_date as number)));
  const resolvedTs = expiryTs
    ? allTs.reduce((best, ts) =>
        Math.abs(ts - expiryTs) < Math.abs(best - expiryTs) ? ts : best
      )
    : allTs[0]; // nearest

  console.log(`[OI API] resolvedTs=${resolvedTs} from ${allTs.length} expiries`);

  // Fetch all rows for that expiry
  const { data: rows, error: rowErr } = await supabase
    .from('scrip_master')
    .select('p_trd_symbol, p_tok')
    .eq('p_symbol', 'NIFTY')
    .eq('segment', 'nse_fo')
    .eq('l_expiry_date', resolvedTs);

  if (rowErr || !rows?.length) {
    console.error('[OI API] resolveSymbols: no rows for expiry', rowErr);
    return [];
  }

  console.log(`[OI API] ${rows.length} rows for expiry ts=${resolvedTs}`);

  const result: Array<{ strike: number; type: 'CE' | 'PE'; symbol: string; token: string }> = [];

  for (const strike of strikes) {
    for (const type of ['CE', 'PE'] as const) {
      const match = (rows as any[]).find((r) =>
        String(r.p_trd_symbol ?? '').toUpperCase().endsWith(`${strike}${type}`)
      );
      if (match) {
        result.push({ strike, type, symbol: match.p_trd_symbol, token: String(match.p_tok) });
        console.log(`[OI API] ✅ ${strike}${type} → ${match.p_trd_symbol}`);
      } else {
        console.warn(`[OI API] ⚠️  no symbol for ${strike}${type}`);
      }
    }
  }

  return result;
}

// ─── Fetch quotes from existing Kotak proxy ───────────────────────────────────

async function fetchKotakQuotes(
  queries: Array<{ segment: string; symbol: string }>,
  session: KotakSession,
  origin: string
): Promise<any[]> {
  if (!queries.length) return [];

  const params = new URLSearchParams({
    queries:      JSON.stringify(queries),
    filter:       'all',
    tradingToken: session.tradingToken,
    tradingSid:   session.tradingSid,
    baseUrl:      session.baseUrl,
    consumerKey:  session.consumerKey,
  });

  const url = `${origin}/api/kotak/quotes?${params.toString()}`;
  console.log(`[OI API] Calling Kotak proxy for ${queries.length} symbols`);

  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();

  if (!json.success) {
    throw new Error(`Kotak proxy returned error: ${json.error ?? JSON.stringify(json)}`);
  }

  return Array.isArray(json.data) ? json.data : [];
}

// ─── GET /api/oichart ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // Required
  const spotPrice   = parseFloat(sp.get('spot') || '0');
  const minutesBack = parseInt(sp.get('minutes') || '60');
  const expiryTs    = sp.get('expiry') ? parseInt(sp.get('expiry')!) : undefined;

  // Kotak session — client reads from localStorage and passes as query params
  const tradingToken   = sp.get('tradingToken')  ?? '';
  const tradingSid     = sp.get('tradingSid')    ?? '';
  const sessionBaseUrl = sp.get('baseUrl')       ?? '';
  const consumerKey    = sp.get('consumerKey')
    || process.env.NEXT_PUBLIC_KOTAK_CONSUMER_KEY
    || 'c63d7961-e935-4bce-8183-c63d9d2342f0';

  if (!spotPrice || spotPrice < 1000) {
    return NextResponse.json(
      { success: false, error: 'Valid spot price (>1000) required' },
      { status: 400 }
    );
  }

  const hasSession = !!(tradingToken && tradingSid && sessionBaseUrl);
  console.log(`[OI API] spot=${spotPrice} hasSession=${hasSession} minutes=${minutesBack}`);

  // ATM ± 2 strikes
  const atmStrike = Math.round(spotPrice / 50) * 50;
  const strikes   = [
    atmStrike - 100,
    atmStrike - 50,
    atmStrike,
    atmStrike + 50,
    atmStrike + 100,
  ];

  const nowTs    = Math.floor(Date.now() / 1000);
  const startTs  = nowTs - minutesBack * 60;

  if (!hasSession) {
    return NextResponse.json({
      success: true,
      data: {
        oiData: [],
        alerts: [],
        strikes,
        atmStrike,
        dataSource: 'no_session',
        message: 'Please log in to Kotak Neo to see live OI data',
        timeRange: { start: startTs, end: nowTs, minutes: minutesBack },
      },
    });
  }

  const session: KotakSession = {
    tradingToken,
    tradingSid,
    baseUrl: sessionBaseUrl,
    consumerKey,
  };

  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    // 1. Resolve DB symbols
    const symbols = await resolveSymbols(strikes, expiryTs);

    if (!symbols.length) {
      return NextResponse.json(
        { success: false, error: 'No option symbols found. Run a scrip master sync first.' },
        { status: 404 }
      );
    }

    // 2. Live Kotak quotes
    const queries   = symbols.map((s) => ({ segment: 'nse_fo', symbol: s.symbol }));
    const rawQuotes = await fetchKotakQuotes(queries, session, origin);

    // 3. Store snapshot in history + build current points
    const currentPoints: OIDataPoint[] = [];

    rawQuotes.forEach((q: any, idx: number) => {
      const sym = symbols[idx];
      if (!sym) return;

      const oi  = parseInt(String(q.open_int ?? q.oi ?? q.openInterest ?? 0))  || 0;
      const ltp = parseFloat(String(q.ltp ?? q.ltP ?? q.lp ?? q.last_price ?? 0)) || 0;
      const vol = parseInt(String(q.last_volume ?? q.volume ?? q.vol ?? 0))    || 0;

      const key = `${sym.strike}-${sym.type}`;
      pushToHistory(key, { timestamp: nowTs, oi, ltp, volume: vol });

      currentPoints.push({
        timestamp: nowTs,
        strike: sym.strike,
        type:   sym.type,
        oi,
        ltp,
        volume: vol,
      });

      console.log(`[OI API] ${sym.symbol}: ltp=${ltp} oi=${oi} vol=${vol}`);
    });

    // 4. Build full time-series from accumulated history
    const allOIData: OIDataPoint[] = [];
    for (const sym of symbols) {
      const key  = `${sym.strike}-${sym.type}`;
      const hist = (oiHistory.get(key) ?? []).filter((p) => p.timestamp >= startTs);
      for (const p of hist) {
        allOIData.push({
          timestamp: p.timestamp,
          strike:    sym.strike,
          type:      sym.type,
          oi:        p.oi,
          ltp:       p.ltp,
          volume:    p.volume,
        });
      }
    }

    // 5. Short covering detection (compare last 2 snapshots)
    const alerts: ShortCoveringAlert[] = [];
    for (const sym of symbols) {
      const key  = `${sym.strike}-${sym.type}`;
      const hist = oiHistory.get(key) ?? [];
      if (hist.length < 2) continue;

      const prev = hist[hist.length - 2];
      const curr = hist[hist.length - 1];

      const priceChange  = curr.ltp    - prev.ltp;
      const volumeChange = curr.volume - prev.volume;
      const oiChange     = curr.oi     - prev.oi;
      const pricePct     = prev.ltp > 0 ? (priceChange / prev.ltp) * 100 : 0;

      // Condition: price UP ≥1%, volume UP, OI DOWN
      if (pricePct >= 1 && volumeChange > 0 && oiChange < 0) {
        alerts.push({
          id:          `${sym.strike}-${sym.type}-${curr.timestamp}`,
          timestamp:   curr.timestamp,
          strike:      sym.strike,
          type:        sym.type,
          symbol:      sym.symbol,
          priceChange,
          volumeChange,
          oiChange,
          description: `Price ↑ ₹${priceChange.toFixed(2)} (+${pricePct.toFixed(1)}%), Vol ↑ ${volumeChange.toLocaleString()}, OI ↓ ${Math.abs(oiChange).toLocaleString()} — Possible short covering`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        oiData:        allOIData,
        alerts,
        strikes,
        atmStrike,
        dataSource:    'live',
        symbolsFound:  symbols.length,
        historyPoints: allOIData.length,
        timeRange: { start: startTs, end: nowTs, minutes: minutesBack },
      },
    });
  } catch (err) {
    console.error('[OI API] Unhandled error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
