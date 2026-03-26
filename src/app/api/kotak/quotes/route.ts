// src/app/api/kotak/quotes/route.ts
/**
 * Next.js API Route for Kotak Neo Quotes API
 *
 * Proxies Quotes requests server-side to bypass CORS.
 * 
 * GET /api/kotak/quotes?segment=nse_cm&symbols=INFY,TCS&filter=ltp
 *      &tradingToken=...&tradingSid=...&baseUrl=...&consumerKey=...
 *
 * Query params:
 *   - segment    : default exchange segment (e.g. nse_cm). Can be overridden per-symbol.
 *   - symbols    : comma-separated pSymbol values (from scrip master).
 *   - queries    : JSON array of { segment, symbol } objects (alternative to symbols+segment).
 *   - filter     : all | ltp | ohlc | depth | scrip_details | 52W | circuit_limits | oi  (default: ltp)
 *   - tradingToken, tradingSid, baseUrl, consumerKey : from /tradeApiValidate login response
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;

    const tradingToken = p.get('tradingToken');
    const tradingSid  = p.get('tradingSid');
    const baseUrl     = p.get('baseUrl');
    const consumerKey = p.get('consumerKey');

    if (!tradingToken || !tradingSid || !baseUrl || !consumerKey) {
      return NextResponse.json(
        { error: 'Missing required session params: tradingToken, tradingSid, baseUrl, consumerKey' },
        { status: 400 }
      );
    }

    // Build query string: exchange_segment|symbol,...
    let queryString = '';

    const queriesParam = p.get('queries'); // JSON array
    if (queriesParam) {
      try {
        const queries: Array<{ segment: string; symbol: string }> = JSON.parse(queriesParam);
        queryString = queries.map(q => `${q.segment}|${q.symbol}`).join(',');
      } catch {
        return NextResponse.json({ error: 'Invalid JSON in queries param' }, { status: 400 });
      }
    } else {
      const symbols  = p.get('symbols');  // comma-separated
      const segment  = p.get('segment') || 'nse_cm';
      if (!symbols) {
        return NextResponse.json(
          { error: 'Provide either queries (JSON) or symbols + segment params' },
          { status: 400 }
        );
      }
      queryString = symbols.split(',').map(s => `${segment}|${s.trim()}`).join(',');
    }

    const filter = p.get('filter') || 'ltp';

    // Each segment|symbol pair must be URL-encoded individually so that special
    // characters in trading symbols (spaces, slashes, etc.) don't break the URL path.
    // The pairs themselves are joined by commas which are safe in a URL path segment.
    const encodedQueryString = queryString
      .split(',')
      .map(pair => {
        const [seg, ...symParts] = pair.split('|');
        const sym = symParts.join('|'); // re-join in case symbol itself had a pipe (unlikely but safe)
        return `${encodeURIComponent(seg)}|${encodeURIComponent(sym)}`;
      })
      .join(',');

    // Add cache-busting query param to force fresh data from Kotak
    const timestamp = Date.now();
    const kotakUrl = `${baseUrl}/script-details/1.0/quotes/neosymbol/${encodedQueryString}/${filter}?t=${timestamp}`;

    console.log('[API/quotes] 📤 Fetching:', kotakUrl);
    console.log('[API/quotes] 📋 Raw query pairs:', queryString);

    const response = await fetch(kotakUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': consumerKey,
        'neo-fin-key': 'neotradeapi',
        'Sid': tradingSid,
        'Auth': tradingToken,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

    const responseText = await response.text();
    console.log('[API/quotes] 📥 Status:', response.status, '| Raw (200 chars):', responseText.substring(0, 200));

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { error: 'Non-JSON response from Kotak Quotes API', raw: responseText.substring(0, 300) },
        { status: 502 }
      );
    }

    // Kotak error response (stat-based)
    if (data?.stat === 'Not_Ok') {
      console.error('[API/quotes] ❌ Kotak error:', data.emsg, '| stCode:', data.stCode);
      return NextResponse.json(
        { error: data.emsg || 'Kotak Quotes error', stCode: data.stCode },
        { status: 400 }
      );
    }

    // Kotak fault response (e.g. {"fault":{"code":"400","description":"...","message":"..."}})
    if (data?.fault) {
      const fault = data.fault;
      console.error('[API/quotes] ❌ Kotak fault:', fault.description || fault.message, '| code:', fault.code);
      return NextResponse.json(
        { error: fault.description || fault.message || 'Kotak Quotes fault', faultCode: fault.code },
        { status: 400 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Kotak Quotes HTTP ${response.status}: ${response.statusText}`, details: data },
        { status: response.status }
      );
    }

    const quotes = Array.isArray(data) ? data : data?.data || [];
    console.log('[API/quotes] ✅ Quotes fetched:', quotes.length, 'instruments | first:', JSON.stringify(quotes[0] || {}));

    return NextResponse.json({ success: true, data: quotes });
  } catch (error) {
    console.error('[API/quotes] ❌ Server error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch quotes' },
      { status: 500 }
    );
  }
}
