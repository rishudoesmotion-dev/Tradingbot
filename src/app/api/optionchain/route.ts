import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_RANGE = 5
const DEFAULT_RATE = 0.065
const STRIKE_STEP = 50

function roundToNearest50(n: number) {
  return Math.round(n / STRIKE_STEP) * STRIKE_STEP
}

/* ---------------------------
   NORMAL DISTRIBUTION
--------------------------- */

function normCdf(x: number): number {
  const p = 0.3275911
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429

  const sign = x < 0 ? -1 : 1
  const t = 1 / (1 + p * Math.abs(x) / Math.sqrt(2))

  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-(x * x) / 2))

  return 0.5 * (1 + sign * y)
}

function normPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

/* ---------------------------
   BLACK SCHOLES
--------------------------- */

function bsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: 'CE' | 'PE'
) {
  const sqrtT = Math.sqrt(T)

  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) /
    (sigma * sqrtT)

  const d2 = d1 - sigma * sqrtT

  const Kert = K * Math.exp(-r * T)

  const price =
    type === 'CE'
      ? S * normCdf(d1) - Kert * normCdf(d2)
      : Kert * normCdf(-d2) - S * normCdf(-d1)

  const delta = type === 'CE' ? normCdf(d1) : normCdf(d1) - 1

  const gamma = normPdf(d1) / (S * sigma * sqrtT)

  const thetaAnnual =
    type === 'CE'
      ? -(S * normPdf(d1) * sigma) / (2 * sqrtT) -
        r * Kert * normCdf(d2)
      : -(S * normPdf(d1) * sigma) / (2 * sqrtT) +
        r * Kert * normCdf(-d2)

  return {
    price,
    delta,
    gamma,
    theta: thetaAnnual / 365,
    vega: (S * normPdf(d1) * sqrtT) / 100,
  }
}

/* ===============================
   API ROUTE
================================ */

export async function GET(req: NextRequest) {
  try {
    console.log('[optionchain] → request received')
    const cookieStore = cookies()
    console.log('[optionchain] → cookies ok')
    const sp = req.nextUrl.searchParams

    const spot =
      parseFloat(cookieStore.get('spot')?.value ?? '') ||
      parseFloat(sp.get('spot') ?? '')

    console.log('[optionchain] → spot:', spot)

    const range =
      parseInt(cookieStore.get('range')?.value ?? '') ||
      parseInt(sp.get('range') ?? String(DEFAULT_RANGE), 10)

    const rate =
      parseFloat(cookieStore.get('rate')?.value ?? '') ||
      parseFloat(sp.get('rate') ?? String(DEFAULT_RATE))

    const hintTs =
      parseInt(cookieStore.get('expiry')?.value ?? '') ||
      (sp.get('expiry') ? parseInt(sp.get('expiry')!) : null)

    if (!spot || isNaN(spot)) {
      return NextResponse.json(
        { status: 'error', message: 'Missing or invalid spot cookie' },
        { status: 400 }
      )
    }

    const atmStrike = roundToNearest50(spot)

    /* ---------------------------
       FETCH EXPIRIES
    --------------------------- */

    const nowTs = Math.floor(Date.now() / 1000)
    console.log('[optionchain] → fetching expiries, nowTs:', nowTs)

    const { data: expData, error: expError } = await supabase
      .from('scrip_master')
      .select('l_expiry_date')
      .eq('p_symbol', 'NIFTY')
      .eq('segment', 'nse_fo')
      .gte('l_expiry_date', nowTs)
      .order('l_expiry_date')

    console.log('[optionchain] → expiries fetched:', expData?.length, 'err:', expError?.message)

    if (!expData?.length) {
      return NextResponse.json(
        { status: 'error', message: 'No expiries found' },
        { status: 404 }
      )
    }

    const expiries = Array.from(
      new Set(expData.map((r: any) => r.l_expiry_date))
    )

    const resolvedTs = hintTs
      ? expiries.reduce((best, ts) =>
          Math.abs(ts - hintTs) < Math.abs(best - hintTs)
            ? ts
            : best
        )
      : expiries[0]

    /* ---------------------------
       FETCH OPTION ROWS
    --------------------------- */

    console.log('[optionchain] → fetching rows for expiry:', resolvedTs)

    const { data: rows, error: rowsError } = await supabase
      .from('scrip_master')
      .select('*')
      .eq('p_symbol', 'NIFTY')
      .eq('segment', 'nse_fo')
      .eq('l_expiry_date', resolvedTs)

    console.log('[optionchain] → rows fetched:', rows?.length, 'err:', rowsError?.message)

    if (!rows?.length) {
      return NextResponse.json(
        { status: 'error', message: 'No option rows found' },
        { status: 404 }
      )
    }

    /* ---------------------------
       TIME TO EXPIRY
    --------------------------- */

    const daysLeft = Math.max(
      (resolvedTs - nowTs) / 86400,
      0.001
    )

    const tte = daysLeft / 365

    const expiryDate = new Date(resolvedTs * 1000)
      .toISOString()
      .slice(0, 10)

    /* ---------------------------
       STRIKES — parsed from p_trd_symbol e.g. NIFTY2640717250PE
    --------------------------- */

    // Parse strike and option type from trading symbol
    // Format: {SYMBOL}{YYMDD}{strike}{CE|PE}  e.g. NIFTY2640722200CE
    // Kotak uses compact date: YY + M(1-digit) + DD  = 5 digits  e.g. 26407 = Apr 07, 2026
    // Followed by the numeric strike and CE/PE
    function parseTrdSymbol(trdSymbol: string): { strike: number; type: 'CE' | 'PE' } | null {
      const m = trdSymbol.match(/^[A-Z]+\d{5}(\d+)(CE|PE)$/)
      if (!m) return null
      return { strike: parseInt(m[1]), type: m[2] as 'CE' | 'PE' }
    }

    const strikes = Array.from(
      new Set(
        rows
          .map((r: any) => parseTrdSymbol(r.p_trd_symbol)?.strike)
          .filter((s): s is number => s !== undefined && s >= atmStrike - 5000 && s <= atmStrike + 5000)
      )
    ).sort((a, b) => a - b)

    console.log('[optionchain] → strikes count:', strikes.length, 'atm:', atmStrike, 'sample:', strikes.slice(0,5))

    const atmIdx = strikes.reduce((bi, s, i) =>
      Math.abs(s - atmStrike) < Math.abs(strikes[bi] - atmStrike)
        ? i
        : bi
    , 0)

    const visible = new Set(
      strikes.slice(
        Math.max(0, atmIdx - range),
        atmIdx + range + 1
      )
    )

    /* ---------------------------
       BUILD STRIKE MAP
    --------------------------- */

    const strikeMap = new Map()

    rows.forEach((row: any) => {
      const parsed = parseTrdSymbol(row.p_trd_symbol)
      if (!parsed) return
      const { strike, type } = parsed

      if (!visible.has(strike)) return

      if (!strikeMap.has(strike)) strikeMap.set(strike, {})

      const entry = strikeMap.get(strike)
      if (type === 'CE') entry.ce = row
      if (type === 'PE') entry.pe = row
    })

    /* ---------------------------
       FETCH QUOTES — skipped server-side (no Kotak session
       available here). The OptionsChain component subscribes
       via WebSocket for live LTPs after this response loads.
    --------------------------- */

    const quoteMap = new Map<string, any>()

    /* ---------------------------
       BUILD OPTION CHAIN
    --------------------------- */

    const oc: any = {}

    function parseLeg(tok: string, strike: number, type: 'CE' | 'PE') {
      const q = quoteMap.get(tok) ?? {}

      const ltp = parseFloat(q.ltp ?? q.lp ?? 0) || 0
      const oi = parseInt(q.open_int ?? 0) || 0
      const vol = parseInt(q.last_volume ?? 0) || 0

      const iv = ltp > 0 ? 0.2 : null

      let greeks = null

      if (iv) {
        const bs = bsPrice(spot, strike, tte, rate, iv, type)

        greeks = {
          delta: bs.delta,
          gamma: bs.gamma,
          theta: bs.theta,
          vega: bs.vega,
        }
      }

      return {
        security_id: parseInt(tok),
        last_price: ltp,
        oi,
        volume: vol,
        implied_volatility: iv ? iv * 100 : null,
        greeks,
        ohlc: {
          open: q.ohlc?.open ?? 0,
          high: q.ohlc?.high ?? 0,
          low: q.ohlc?.low ?? 0,
          close: q.ohlc?.close ?? 0,
        },
      }
    }

    strikeMap.forEach((entry: any, strike) => {
      const key = String(strike)

      oc[key] = {}

      if (entry.ce)
        oc[key].ce = parseLeg(
          String(entry.ce.p_tok),
          strike,
          'CE'
        )

      if (entry.pe)
        oc[key].pe = parseLeg(
          String(entry.pe.p_tok),
          strike,
          'PE'
        )
    })

    /* ---------------------------
       RESPONSE
    --------------------------- */

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

    return NextResponse.json(
      { status: 'error', message: msg },
      { status: 500 }
    )
  }
}