import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_RANGE = 1   // ±1 strike around ATM
const DEFAULT_RATE = 0.065
const STRIKE_STEP = 50
const NIFTY_RANGE = 1500  // fetch ±1500 pts worth of strikes for ATM detection

function roundToNearest50(n: number) {
  return Math.round(n / STRIKE_STEP) * STRIKE_STEP
}

/* ---------------------------
   BLACK SCHOLES — IV via Brent's method
--------------------------- */

function calcIV(market: number, S: number, K: number, T: number, r: number, type: 'CE' | 'PE'): number | null {
  if (market <= 0 || S <= 0 || K <= 0 || T <= 0) return null
  const intrinsic = type === 'CE' ? Math.max(0, S - K) : Math.max(0, K - S)
  if (market < intrinsic) return null
  const MIN_IV = 0.001, MAX_IV = 20.0, TOL = 1e-6, MAX_IT = 100
  const f = (s: number) => bsPrice(S, K, T, r, s, type).price - market
  if (f(MIN_IV) * f(MAX_IV) > 0) return null
  let a = MIN_IV, b = MAX_IV, fa = f(a), c = a, fc = fa, d = 0, mflag = true
  for (let i = 0; i < MAX_IT; i++) {
    if (Math.abs(b - a) < TOL) break
    const fb = f(b)
    let s: number
    if (fa !== fc && fb !== fc) {
      s = (a * fb * fc) / ((fa - fb) * (fa - fc))
        + (b * fa * fc) / ((fb - fa) * (fb - fc))
        + (c * fa * fb) / ((fc - fa) * (fc - fb))
    } else {
      s = b - fb * (b - a) / (fb - fa)
    }
    const cond = s < (3 * a + b) / 4 || s > b
      || (mflag && Math.abs(s - b) >= Math.abs(b - c) / 2)
      || (!mflag && Math.abs(s - b) >= Math.abs(c - d) / 2)
      || (mflag && Math.abs(b - c) < TOL)
      || (!mflag && Math.abs(c - d) < TOL)
    if (cond) { s = (a + b) / 2; mflag = true } else { mflag = false }
    d = c; c = b; fc = fb
    const fs = f(s)
    if (fa * fs < 0) b = s; else { a = s; fa = fs }
    if (Math.abs(f(a)) < Math.abs(f(b))) { [a, b] = [b, a]; fa = f(a) }
  }
  return b > MIN_IV && b < MAX_IV ? b : null
}

function normCdf(x: number): number {
  const p = 0.3275911
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429
  const sign = x < 0 ? -1 : 1
  const t = 1 / (1 + p * Math.abs(x) / Math.sqrt(2))
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-(x * x) / 2))
  return 0.5 * (1 + sign * y)
}

function normPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: 'CE' | 'PE') {
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  const Kert = K * Math.exp(-r * T)
  const price = type === 'CE' ? S * normCdf(d1) - Kert * normCdf(d2) : Kert * normCdf(-d2) - S * normCdf(-d1)
  const delta = type === 'CE' ? normCdf(d1) : normCdf(d1) - 1
  const gamma = normPdf(d1) / (S * sigma * sqrtT)
  const thetaAnnual = type === 'CE' ? -(S * normPdf(d1) * sigma) / (2 * sqrtT) - r * Kert * normCdf(d2) : -(S * normPdf(d1) * sigma) / (2 * sqrtT) + r * Kert * normCdf(-d2)
  return {
    price, delta, gamma,
    theta: thetaAnnual / 365,
    vega: (S * normPdf(d1) * sqrtT) / 100,
  }
}

/* ===============================
   API ROUTE
================================ */

export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies()
    const sp = req.nextUrl.searchParams

    const range = Math.min(5, Math.max(1, parseInt(sp.get('range') ?? String(DEFAULT_RANGE), 10)))
    const rate = parseFloat(sp.get('rate') ?? String(DEFAULT_RATE))
    const hintTs = sp.get('expiry') ? parseInt(sp.get('expiry')!) : null

    /* ---------------------------
       KOTAK SESSION (REQUIRED)
    --------------------------- */

    const cookieSession = (() => {
      try {
        const raw = cookieStore.get('kotak_session')?.value
        return raw ? JSON.parse(raw) : null
      } catch { return null }
    })()

    const tradingToken = sp.get('tradingToken') ?? cookieSession?.tradingToken ?? null
    const tradingSid   = sp.get('tradingSid')   ?? cookieSession?.tradingSid   ?? null
    const sessionBaseUrl = sp.get('baseUrl')    ?? cookieSession?.baseUrl      ?? null
    const rawCK        = sp.get('consumerKey')  ?? cookieSession?.consumerKey  ?? null
    const consumerKey  = (rawCK && rawCK !== 'undefined' && rawCK !== 'null')
      ? rawCK
      : (process.env.NEXT_PUBLIC_KOTAK_CONSUMER_KEY ?? 'c63d7961-e935-4bce-8183-c63d9d2342f0')

    if (!tradingToken || !tradingSid || !sessionBaseUrl) {
      return NextResponse.json(
        { status: 'error', message: 'Kotak session required. Please login first or pass tradingToken/tradingSid/baseUrl as query params.' },
        { status: 401 }
      )
    }

    const kotakHeaders: Record<string, string> = {
      'Authorization': consumerKey,
      'neo-fin-key':   'neotradeapi',
      'Sid':           tradingSid,
      'Auth':          tradingToken,
      'accept':        'application/json',
    }

    /* ---------------------------
       FETCH EXPIRIES
    --------------------------- */

    const nowTs = Math.floor(Date.now() / 1000)
    const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)  // Today at midnight
    
    // Fetch expiries from today onwards (even if today's expiry has technically passed)
    const { data: expData, error: expError } = await supabase
      .from('scrip_master')
      .select('l_expiry_date')
      .eq('p_symbol', 'NIFTY')
      .eq('segment', 'nse_fo')
      .gte('l_expiry_date', todayStart)  // From today (midnight) onwards
      .order('l_expiry_date')


    if (!expData?.length) {
      return NextResponse.json({ status: 'error', message: 'No expiries found' }, { status: 404 })
    }

    const expiries = Array.from(new Set(expData.map((r: any) => r.l_expiry_date)))
    
    
    // Pick the NEAREST expiry (smallest timestamp >= nowTs)
    // This prefers today's expiry if available, otherwise next week
    const resolvedTs = hintTs 
      ? expiries.reduce((best, ts) => Math.abs(ts - hintTs) < Math.abs(best - hintTs) ? ts : best) 
      : expiries.reduce((nearest, ts) => ts < nearest ? ts : nearest, expiries[0])


    /* ---------------------------
       FETCH OPTION ROWS (wide range)
    --------------------------- */

    const { data: rows, error: rowsError } = await supabase
      .from('scrip_master')
      .select('*')
      .eq('p_symbol', 'NIFTY')
      .eq('segment', 'nse_fo')
      .eq('l_expiry_date', resolvedTs)


    if (!rows?.length) {
      return NextResponse.json({ status: 'error', message: 'No option rows found' }, { status: 404 })
    }

    const daysLeft = Math.max((resolvedTs - nowTs) / 86400, 0.001)
    const tte = daysLeft / 365
    const expiryDate = new Date(resolvedTs * 1000).toISOString().slice(0, 10)

    function parseTrdSymbol(trdSymbol: string): { strike: number; type: 'CE' | 'PE' } | null {
      const m = trdSymbol.match(/^[A-Z]+\d{5}(\d+)(CE|PE)$/)
      if (!m) return null
      return { strike: parseInt(m[1]), type: m[2] as 'CE' | 'PE' }
    }

    // Fetch ALL strikes (no range filter — let put-call parity find the real ATM)
    const strikes = Array.from(
      new Set(
        rows
          .map((r: any) => parseTrdSymbol(r.p_trd_symbol)?.strike)
          .filter((s): s is number => s !== undefined && s > 0)
      )
    ).sort((a, b) => a - b)


    /* ---------------------------
       BUILD STRIKE MAP (all strikes)
    --------------------------- */

    const strikeMap = new Map()
    rows.forEach((row: any) => {
      const parsed = parseTrdSymbol(row.p_trd_symbol)
      if (!parsed) return
      const { strike, type } = parsed
      if (!strikeMap.has(strike)) strikeMap.set(strike, {})
      const entry = strikeMap.get(strike)
      if (type === 'CE') entry.ce = row
      if (type === 'PE') entry.pe = row
    })

    /* ---------------------------
       FETCH LIVE QUOTES — two-pass
       Pass 1: sample ~20 strikes spread across full range to find real ATM
       Pass 2: fetch only ±(range+1) strikes around the real ATM
    --------------------------- */

    const quoteMap = new Map<string, any>()

    const CONCURRENCY = 10  // Reduced from 50 to avoid rate limiting
    const fetchOne = async (tok: string) => {
      try {
        const url = `${sessionBaseUrl}/script-details/1.0/quotes/neosymbol/nse_fo|${tok}/all`
        const res  = await fetch(url, { method: 'GET', headers: kotakHeaders })
        if (!res.ok) {
          console.log(`[optionchain] ❌ Failed to fetch token ${tok}: ${res.status} ${res.statusText}`)
          return
        }
        const json = await res.json()
        const raw  = Array.isArray(json) ? json[0] : (json?.data ? (Array.isArray(json.data) ? json.data[0] : json.data) : json)
        if (raw) {
          quoteMap.set(tok, raw)
          console.log(`[optionchain] ✅ Fetched token ${tok}: LTP=${raw.ltp || raw.lp}`)
        }
      } catch (err) { 
        console.log(`[optionchain] ❌ Error fetching token ${tok}:`, err instanceof Error ? err.message : String(err))
      }
    }

    // Helper to add delay between batches
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Pass 1: sample every Nth strike evenly to find the liquid zone (ATM detection)
    const SAMPLE_SIZE = 30
    const step1 = Math.max(1, Math.floor(strikes.length / SAMPLE_SIZE))
    const sampleStrikes = strikes.filter((_, i) => i % step1 === 0)
    const pass1Tokens: string[] = []
    sampleStrikes.forEach(strike => {
      const entry = strikeMap.get(strike)
      if (entry?.ce?.p_tok) pass1Tokens.push(String(entry.ce.p_tok))
      if (entry?.pe?.p_tok) pass1Tokens.push(String(entry.pe.p_tok))
    })

    console.log(`[optionchain] → pass1: sampling ${sampleStrikes.length} strikes (${pass1Tokens.length} tokens)`)

    for (let i = 0; i < pass1Tokens.length; i += CONCURRENCY) {
      await Promise.all(pass1Tokens.slice(i, i + CONCURRENCY).map(fetchOne))
      if (i + CONCURRENCY < pass1Tokens.length) {
        await delay(100)  // 100ms delay between batches to avoid rate limiting
      }
    }

    console.log(`[optionchain] → pass1 done: ${quoteMap.size}/${pass1Tokens.length} quotes`)


    /* ---------------------------
       FIND REAL ATM via put-call parity across ALL strikes
    --------------------------- */

    let bestSpot = 0
    let bestStrike = 0
    let bestScore = 999999  // Lower is better (smallest CE-PE diff)

    const candidates: Array<{strike: number, spot: number, ceLtp: number, peLtp: number, diff: number, vol: number}> = []

    strikeMap.forEach((entry: any, strike) => {
      const ceTok = entry.ce?.p_tok ? String(entry.ce.p_tok) : null
      const peTok = entry.pe?.p_tok ? String(entry.pe.p_tok) : null
      if (!ceTok || !peTok) return

      const ceQ = quoteMap.get(ceTok)
      const peQ = quoteMap.get(peTok)
      if (!ceQ || !peQ) return

      const ceLtp = parseFloat(String(ceQ.ltp ?? ceQ.lp ?? 0))
      const peLtp = parseFloat(String(peQ.ltp ?? peQ.lp ?? 0))
      const ceVol = parseInt(String(ceQ.last_volume ?? ceQ.volume ?? 0))
      const peVol = parseInt(String(peQ.last_volume ?? peQ.volume ?? 0))
      const totalVol = ceVol + peVol

      if (ceLtp > 0 && peLtp > 0) {
        const derivedSpot = strike + ceLtp - peLtp
        const diff = Math.abs(ceLtp - peLtp)
        
        candidates.push({ strike, spot: derivedSpot, ceLtp, peLtp, diff, vol: totalVol })

        // Pick the strike with CE/PE closest in value AND decent volume
        // Prioritize small diff, but also consider volume (avoid illiquid strikes)
        const score = diff + (totalVol < 1000000 ? 50 : 0)  // Penalty for low volume
        
        if (score < bestScore && derivedSpot > 1000 && derivedSpot < 50000) {
          bestSpot = derivedSpot
          bestStrike = strike
          bestScore = score
        }
      }
    })

    console.log('[optionchain] → ATM candidates (top 5):', 
      candidates
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 5)
        .map(c => `${c.strike}: CE=${c.ceLtp} PE=${c.peLtp} diff=${c.diff.toFixed(1)} vol=${c.vol}`)
    )

    // Fallback: use median strike if parity failed (all prices 0)
    if (bestSpot === 0 && strikes.length > 0) {
      bestStrike = strikes[Math.floor(strikes.length / 2)]
      bestSpot = bestStrike
      console.log('[optionchain] → no live prices found, falling back to median strike:', bestStrike)
    }

    const spot = Math.round(bestSpot * 100) / 100
    const atmStrike = roundToNearest50(spot)

    console.log(`[optionchain] → real spot derived: ${spot}, ATM: ${atmStrike} (from strike ${bestStrike}, score=${bestScore.toFixed(1)})`)

    /* ---------------------------
       FILTER TO ±range around ATM
    --------------------------- */

    const atmIdx = strikes.findIndex(s => s === atmStrike)
    const visibleStrikes = strikes.slice(
      Math.max(0, atmIdx - range),
      atmIdx + range + 1
    )

    console.log('[optionchain] → visible strikes:', visibleStrikes)

    // Pass 2: fetch all tokens for visible strikes (they may not be in pass1 sample)
    const pass2Tokens: string[] = []
    visibleStrikes.forEach(strike => {
      const entry = strikeMap.get(strike)
      if (entry?.ce?.p_tok && !quoteMap.has(String(entry.ce.p_tok)))
        pass2Tokens.push(String(entry.ce.p_tok))
      if (entry?.pe?.p_tok && !quoteMap.has(String(entry.pe.p_tok)))
        pass2Tokens.push(String(entry.pe.p_tok))
    })

    if (pass2Tokens.length > 0) {
      console.log(`[optionchain] → pass2: fetching ${pass2Tokens.length} missing tokens for visible strikes`)
      for (let i = 0; i < pass2Tokens.length; i += CONCURRENCY) {
        await Promise.all(pass2Tokens.slice(i, i + CONCURRENCY).map(fetchOne))
        if (i + CONCURRENCY < pass2Tokens.length) {
          await delay(100)  // 100ms delay between batches
        }
      }
      console.log(`[optionchain] → pass2 done, quoteMap size: ${quoteMap.size}`)
    }

    /* ---------------------------
       BUILD OPTION CHAIN
    --------------------------- */

    const oc: any = {}

    function parseLeg(tok: string, strike: number, type: 'CE' | 'PE') {
      const q = quoteMap.get(tok) ?? {}
      const ltp = parseFloat(String(q.ltp ?? q.lp ?? q.last_price ?? 0)) || 0
      const oi  = parseInt(String(q.open_int ?? q.oi ?? 0)) || 0
      const vol = parseInt(String(q.last_volume ?? q.volume ?? 0)) || 0

      let iv: number | null = null
      let greeks = null

      if (ltp > 0 && tte > 0) {
        iv = calcIV(ltp, spot, strike, tte, rate, type)
        if (iv !== null) {
          const bs = bsPrice(spot, strike, tte, rate, iv, type)
          greeks = {
            delta: +bs.delta.toFixed(4),
            gamma: +bs.gamma.toFixed(6),
            theta: +bs.theta.toFixed(4),
            vega:  +bs.vega.toFixed(4),
          }
        }
      }

      const ohlcRaw = q.ohlc ?? {}

      return {
        security_id:        parseInt(tok),
        last_price:         ltp,
        oi,
        volume:             vol,
        change:             parseFloat(String(q.change ?? 0)) || 0,
        per_change:         parseFloat(String(q.per_change ?? 0)) || 0,
        implied_volatility: iv !== null ? +(iv * 100).toFixed(2) : null,
        greeks,
        ohlc: {
          open:  parseFloat(String(ohlcRaw.open  ?? 0)) || 0,
          high:  parseFloat(String(ohlcRaw.high  ?? 0)) || 0,
          low:   parseFloat(String(ohlcRaw.low   ?? 0)) || 0,
          close: parseFloat(String(ohlcRaw.close ?? 0)) || 0,
        },
      }
    }

    visibleStrikes.forEach(strike => {
      const entry = strikeMap.get(strike)
      if (!entry) return

      const key = String(strike)

      const ceTok = entry.ce?.p_tok ? String(entry.ce.p_tok) : null
      const peTok = entry.pe?.p_tok ? String(entry.pe.p_tok) : null
      
      // Check if we actually have quotes for this strike
      const ceHasQuote = ceTok ? quoteMap.has(ceTok) : false
      const peHasQuote = peTok ? quoteMap.has(peTok) : false
      
      const ceLtp = ceTok && ceHasQuote ? (parseFloat(String(quoteMap.get(ceTok)?.ltp ?? 0)) || 0) : 0
      const peLtp = peTok && peHasQuote ? (parseFloat(String(quoteMap.get(peTok)?.ltp ?? 0)) || 0) : 0

      // Skip ONLY if both quotes were fetched successfully AND both prices are zero
      // This filters out truly expired strikes but includes strikes with missing quotes
      if (ceHasQuote && peHasQuote && ceLtp === 0 && peLtp === 0) {
        console.log(`[optionchain] → skipping strike ${strike}: both CE/PE fetched but zero LTP`)
        return
      }

      oc[key] = {}
      if (entry.ce) oc[key].ce = parseLeg(String(entry.ce.p_tok), strike, 'CE')
      if (entry.pe) oc[key].pe = parseLeg(String(entry.pe.p_tok), strike, 'PE')
    })

    console.log('[optionchain] → final oc keys:', Object.keys(oc).length, 'strikes')
    
    if (Object.keys(oc).length === 0) {
      console.warn('[optionchain] ⚠️ Empty option chain! quoteMap size:', quoteMap.size, 'visibleStrikes:', visibleStrikes.length)
    }

    return NextResponse.json({
      status: 'success',
      data: {
        last_price: spot,
        atm_strike: atmStrike,
        lot_size: 75,
        expiry: resolvedTs,
        expiry_date: expiryDate,
        updated_at: new Date().toISOString(),
        oc,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[optionchain] ❌ Internal error:', msg, stack)

    return NextResponse.json({ status: 'error', message: msg }, { status: 500 })
  }
}
