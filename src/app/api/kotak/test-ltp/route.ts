/**
 * DEBUG endpoint — test what Kotak's LTP endpoint actually returns.
 *
 * Usage (browser, after login):
 *   GET /api/kotak/test-ltp?token=40752&segment=nse_fo
 *
 * It reads your Kotak session from the `kotak_session` cookie
 * OR from query params: tradingToken, tradingSid, baseUrl, consumerKey
 *
 * Tries both known endpoint formats and prints full raw responses.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const token       = sp.get('token')        ?? '40752';   // NIFTY option token
  const segment     = sp.get('segment')      ?? 'nse_fo';
  const tradingToken = sp.get('tradingToken') ?? req.headers.get('x-trading-token') ?? '';
  const tradingSid   = sp.get('tradingSid')   ?? req.headers.get('x-trading-sid')   ?? '';
  const baseUrl      = sp.get('baseUrl')      ?? req.headers.get('x-base-url')      ?? 'https://e22.kotaksecurities.com';
  const rawCK        = sp.get('consumerKey')  ?? req.headers.get('x-consumer-key')  ?? '';
  const consumerKey  = (rawCK && rawCK !== 'undefined' && rawCK !== 'null')
    ? rawCK
    : (process.env.NEXT_PUBLIC_KOTAK_CONSUMER_KEY ?? 'c63d7961-e935-4bce-8183-c63d9d2342f0');

  if (!tradingToken || !tradingSid) {
    return NextResponse.json({
      error: 'Pass tradingToken and tradingSid as query params (copy from localStorage.kotak_session)',
    }, { status: 400 });
  }

  const headers: Record<string, string> = {
    'Authorization': consumerKey,
    'neo-fin-key':   'neotradeapi',
    'Sid':           tradingSid,
    'Auth':          tradingToken,
    'accept':        'application/json',
  };

  const endpoints = [
    // e22 (trading server — baseUrl from session)
    { name: 'e22: oms/v1/quote/ltp (token only)',          url: `${baseUrl}/oms/v1/quote/ltp/${token}` },
    { name: 'e22: oms/v1/quote/ltp (segment|token)',       url: `${baseUrl}/oms/v1/quote/ltp/${segment}|${token}` },
    { name: 'e22: script-details/neosymbol/all',           url: `${baseUrl}/script-details/1.0/quotes/neosymbol/${segment}|${token}/all` },
    { name: 'e22: quick/user/scriptdetail',                url: `${baseUrl}/quick/user/scriptdetail/${segment}|${token}` },
    // mis (login/scrip server)
    { name: 'mis: script-details/neosymbol/all',           url: `https://mis.kotaksecurities.com/script-details/1.0/quotes/neosymbol/${segment}|${token}/all` },
    { name: 'mis: oms/v1/quote/ltp (token only)',          url: `https://mis.kotaksecurities.com/oms/v1/quote/ltp/${token}` },
    // tradeapi (old base)
    { name: 'tradeapi: script-details/neosymbol/all',      url: `https://tradeapi.kotaksecurities.com/apim/script-details/1.0/quotes/neosymbol/${segment}|${token}/all` },
    { name: 'tradeapi: oms/v1/quote/ltp',                  url: `https://tradeapi.kotaksecurities.com/apim/oms/v1/quote/ltp/${token}` },
  ];

  const results: any[] = [];

  for (const ep of endpoints) {
    try {
      const res  = await fetch(ep.url, { method: 'GET', headers });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* xml or plain text */ }
      results.push({
        name:   ep.name,
        url:    ep.url,
        status: res.status,
        body:   text.slice(0, 500),
        parsed,
      });
    } catch (e: any) {
      results.push({ name: ep.name, url: ep.url, error: e.message });
    }
  }

  return NextResponse.json({ token, segment, results }, { status: 200 });
}
