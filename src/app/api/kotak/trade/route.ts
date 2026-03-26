// src/app/api/kotak/trade/route.ts
/**
 * Next.js API Route for Kotak Trading Operations
 * 
 * Proxies trading requests to Kotak Neo API from the browser
 * This bypasses CORS issues by routing through the server
 * 
 * Endpoints support:
 * - GET /api/kotak/trade?action=getBalance
 * - GET /api/kotak/trade?action=getPositions
 * - GET /api/kotak/trade?action=getOrders
 * - POST /api/kotak/trade with various trading operations
 *
 * Trading rules are enforced BEFORE any order reaches the Kotak Neo API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tradesRulesEngine } from '@/lib/rules/TradesRulesEngine_v2';
import { OrderRequest, OrderSide, OrderType, ProductType } from '@/types/broker.types';

const KOTAK_API_BASE = 'https://cis.kotaksecurities.com';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const tradingToken = searchParams.get('tradingToken');
    const tradingSid = searchParams.get('tradingSid');
    const baseUrl = searchParams.get('baseUrl');
    const consumerKey = searchParams.get('consumerKey');

    console.log(`[API] Kotak GET ${action} request received`);

    if (!tradingToken || !tradingSid || !baseUrl || !consumerKey) {
      return NextResponse.json(
        { error: 'Missing required parameters: tradingToken, tradingSid, baseUrl, consumerKey' },
        { status: 400 }
      );
    }

    let endpoint = '';

    switch (action) {
      case 'getBalance':
      case 'getUserLimits':
        // getUserLimits is the correct endpoint for account balance/limits
        endpoint = '/quick/user/limits';
        break;
      case 'getPositions':
        endpoint = '/quick/user/positions';
        break;
      case 'getOrders':
        endpoint = '/quick/user/orders';
        break;
      case 'getLTP':
        const symbol = searchParams.get('symbol');
        if (!symbol) {
          return NextResponse.json(
            { error: 'Missing symbol parameter for getLTP' },
            { status: 400 }
          );
        }
        endpoint = `/oms/v1/quote/ltp/${symbol}`;
        break;
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    const url = `${baseUrl}${endpoint}`;

    console.log(`[API] 📤 Trading GET request:`, { url, action });

    // Build common headers for all Kotak API calls
    // Authorization (consumerKey) is REQUIRED on every request
    const kotakHeaders: Record<string, string> = {
      'accept': 'application/json',
      'Authorization': consumerKey,
      'neo-fin-key': 'neotradeapi',
      'Sid': tradingSid,
      'Auth': tradingToken,
    };

    // getUserLimits needs POST with form-encoded jData
    // getPositions also needs POST with jData={} per Kotak docs
    // getOrders is a true GET request
    let fetchMethod = 'GET';
    let fetchBody: string | undefined = undefined;
    let fetchHeaders = { ...kotakHeaders };

    if (action === 'getBalance' || action === 'getUserLimits') {
      fetchMethod = 'POST';
      fetchBody = 'jData={"seg":"ALL","exch":"ALL","prod":"ALL"}';
      fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (action === 'getPositions') {
      // Kotak positions endpoint requires POST with empty jData body
      fetchMethod = 'POST';
      fetchBody = 'jData={}';
      fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    // getOrders: plain GET, no body

    const response = await fetch(url, {
      method: fetchMethod,
      headers: fetchHeaders,
      ...(fetchBody ? { body: fetchBody } : {}),
    });

    console.log(`[API] 📥 ${action} Response Status:`, response.status, response.statusText);

    let data: any;
    try {
      const responseText = await response.text();
      console.log(`[API] 📥 ${action} Raw response (first 500 chars):`, responseText.substring(0, 500));
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`[API] 📥 Failed to parse ${action} response:`, parseErr);
      return NextResponse.json(
        { error: `Invalid JSON response from Kotak API for ${action}` },
        { status: 500 }
      );
    }

    console.log(`[API] 📥 ${action} Parsed data:`, data);

    // stCode 100022 = "invalid session token" — session has expired, force re-login
    const SESSION_EXPIRED_CODES = [100022, 100010, 100011, 100012];
    if (data?.stCode && SESSION_EXPIRED_CODES.includes(data.stCode)) {
      console.error(`[API] 🔑 ${action} SESSION EXPIRED (stCode ${data.stCode}):`, data.errMsg || data.emsg);
      return NextResponse.json(
        {
          error: 'SESSION_EXPIRED',
          message: 'Your trading session has expired. Please login again.',
          stCode: data.stCode,
          details: data,
        },
        { status: 401 }
      );
    }

    // Other non-200 stCodes = real API errors
    // BUT stCode 5203 = "No Data" = empty result (no positions/orders) — treat as success
    if (data?.stCode && data.stCode !== 200) {
      const noDataCodes = [5203, 5204]; // Kotak "No Data" stCodes
      const errText = (data.errMsg || data.emsg || '').toLowerCase();
      const isNoData = noDataCodes.includes(data.stCode) || errText.includes('no data') || errText.includes('data not found');
      if (isNoData) {
        console.log(`[API] ℹ️ ${action} returned no data (stCode ${data.stCode}):`, data.errMsg);
        return NextResponse.json({ success: true, data: { stat: 'Ok', stCode: 200, data: [] } });
      }
      console.error(`[API] ❌ ${action} Kotak error:`, data.errMsg || data.emsg, 'stCode:', data.stCode);
      return NextResponse.json(
        {
          error: `${action} failed: ${data.errMsg || data.emsg || 'Unknown Kotak error'}`,
          stCode: data.stCode,
          details: data,
        },
        { status: 400 }
      );
    }

    // stat:Not_Ok with emsg "No Data" = empty result (no positions/orders today) — not an auth error
    // Treat it as success with empty data array
    if (data?.stat === 'Not_Ok') {
      const emsg = (data.emsg || data.errMsg || '').toLowerCase();
      if (emsg.includes('no data') || emsg.includes('no record') || emsg.includes('empty') || emsg.includes('data not found')) {
        console.log(`[API] ℹ️ ${action} returned no data (empty):`, data.emsg);
        return NextResponse.json({
          success: true,
          data: { stat: 'Ok', stCode: 200, data: [] }, // normalise to empty array
        });
      }
      // Real error (auth failure, invalid session, etc.)
      console.error(`[API] ❌ ${action} Kotak stat error:`, data.emsg || data.errMsg);
      return NextResponse.json(
        {
          error: `${action} failed: ${data.emsg || data.errMsg || 'Kotak API error'}`,
          details: data,
        },
        { status: 400 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `${action} failed (HTTP ${response.status}): ${response.statusText}`,
          details: data,
        },
        { status: response.status }
      );
    }

    console.log(`[API] ✅ ${action} successful`);

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error('[API] Trading GET error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute trading GET request',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action,
      tradingToken,
      tradingSid,
      baseUrl,
      consumerKey,
      ...operationData
    } = body;

    console.log(`[API] Kotak POST ${action} request received`);

    if (!tradingToken || !tradingSid || !baseUrl || !consumerKey) {
      return NextResponse.json(
        { error: 'Missing required parameters: tradingToken, tradingSid, baseUrl, consumerKey' },
        { status: 400 }
      );
    }

    let endpoint = '';
    let method = 'POST';
    let requestBody = operationData;
    let useFormEncoded = false;

    console.log(`[API] 📋 Received body:`, {
      action,
      tradingToken: tradingToken ? `${tradingToken.substring(0, 20)}...` : 'MISSING',
      tradingSid: tradingSid ? `${tradingSid.substring(0, 20)}...` : 'MISSING',
      baseUrl,
      consumerKey: consumerKey ? `${consumerKey.substring(0, 20)}...` : 'MISSING',
      operationDataKeys: Object.keys(operationData),
    });

    switch (action) {
      case 'placeOrder': {
        // ═══════════════════════════════════════════════════════════════════
        // TRADING RULES GATE — validated BEFORE the order reaches Kotak API
        // ═══════════════════════════════════════════════════════════════════
        //
        // Kotak payload fields:
        //   ts  = trdSymbol (e.g. "NIFTY25APR24500CE")
        //   tt  = side ('B' = BUY, 'S' = SELL)
        //   qty = quantity (integer lots × lot-size)
        //   pr  = price (0 for market orders)
        //   pt  = order type string (MARKET / LIMIT / SL / SL-M)
        //   es  = exchange segment (nse_fo / bse_fo / …)
        //
        const orderSymbol: string = operationData.ts || '';
        const orderSideRaw: string = (operationData.tt || '').toUpperCase();
        const orderQty: number = Number(operationData.qty) || 0;
        const orderPrice: number = Number(operationData.pr) || 0;

        // Map Kotak 'B'/'BUY' → OrderSide.BUY, 'S'/'SELL' → OrderSide.SELL
        const orderSide: OrderSide =
          orderSideRaw === 'B' || orderSideRaw === 'BUY'
            ? OrderSide.BUY
            : OrderSide.SELL;

        const orderRequest: OrderRequest = {
          symbol: orderSymbol,
          exchange: operationData.es || 'nse_fo',
          side: orderSide,
          quantity: orderQty,
          orderType: OrderType.MARKET,
          productType: ProductType.MARGIN,
          price: orderPrice || undefined,
        };

        console.log(`[API] 🛡️ Running trading rules validation for placeOrder:`, {
          symbol: orderRequest.symbol,
          side: orderRequest.side,
          quantity: orderRequest.quantity,
          price: orderRequest.price,
        });

        const rulesResult = await tradesRulesEngine.validateOrder(orderRequest);

        if (!rulesResult.isValid) {
          console.warn(`[API] 🚫 Order BLOCKED by trading rules:`, rulesResult.errors);
          return NextResponse.json(
            {
              success: false,
              blocked: true,
              errors: rulesResult.errors,
              warnings: rulesResult.warnings,
              message: `Order blocked by trading rules: ${rulesResult.errors.join('; ')}`,
            },
            { status: 403 }
          );
        }

        if (rulesResult.warnings.length > 0) {
          console.warn(`[API] ⚠️ Trading rules warnings:`, rulesResult.warnings);
        }

        console.log(`[API] ✅ Trading rules passed — forwarding to Kotak API`);

        // ═══════════════════════════════════════════════════════════════════
        // Kotak Neo API expects form-encoded jData
        // ═══════════════════════════════════════════════════════════════════
        endpoint = '/quick/order/rule/ms/place';
        useFormEncoded = true;
        
        // Map our order type to Kotak's format
        let kotakOrderType = operationData.pt;
        if (operationData.pt === 'MARKET') kotakOrderType = 'MKT';
        else if (operationData.pt === 'LIMIT') kotakOrderType = 'LMT';
        else if (operationData.pt === 'SL') kotakOrderType = 'SL';
        else if (operationData.pt === 'SL-M') kotakOrderType = 'SL-M';
        
        console.log(`[API] 📝 Order type mapping:`, {
          received: operationData.pt,
          kotak: kotakOrderType,
        });
        
        // Transform the payload to match Kotak API format
        requestBody = {
          jData: JSON.stringify({
            am: operationData.am || 'NO',
            dq: operationData.dq || '0',
            es: operationData.es, // exchSeg
            mp: operationData.mp || '0',
            pc: operationData.pc, // productType (CNC, MIS, NRML)
            pf: operationData.pf || 'N',
            pr: operationData.pr || '0', // price (0 for market orders)
            pt: kotakOrderType, // orderType (MKT, LMT, SL, SL-M)
            qt: operationData.qty, // quantity (note: qt not qty)
            rt: operationData.rt || 'DAY',
            tp: operationData.tp || '0', // triggerPrice
            ts: operationData.ts, // trdSymbol
            tt: operationData.tt, // side (B/S)
          }),
        };
        break;
      }
      case 'modifyOrder':
        endpoint = '/quick/order/rule/ms/modify';
        useFormEncoded = true;
        requestBody = {
          jData: JSON.stringify(operationData),
        };
        break;
      case 'cancelOrder':
        endpoint = '/quick/order/rule/ms/cancel';
        useFormEncoded = true;
        method = 'POST';
        requestBody = {
          jData: JSON.stringify(operationData),
        };
        break;
      case 'exitPosition':
        endpoint = '/quick/order/rule/ms/exit';
        useFormEncoded = true;
        requestBody = {
          jData: JSON.stringify(operationData),
        };
        break;
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    const url = `${baseUrl}${endpoint}`;

    console.log(`[API] 📤 Trading POST request:`, {
      url,
      action,
      method,
      body: requestBody,
    });

    // Build request based on content type
    let fetchBody: string | FormData;
    let contentTypeHeader: string;

    if (useFormEncoded) {
      // Use URL-encoded form data for Kotak API
      const params = new URLSearchParams();
      params.append('jData', requestBody.jData);
      fetchBody = params.toString();
      contentTypeHeader = 'application/x-www-form-urlencoded';
      
      console.log(`[API] 📤 Form-encoded body:`, fetchBody.substring(0, 200));
    } else {
      // Use JSON for other requests
      fetchBody = JSON.stringify(requestBody);
      contentTypeHeader = 'application/json';
    }

    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': consumerKey,
        'neo-fin-key': 'neotradeapi',
        'Sid': tradingSid,
        'Auth': tradingToken,
        'Content-Type': contentTypeHeader,
      },
      body: fetchBody,
    });

    console.log(`[API] 📥 Trading POST Response Status:`, response.status, response.statusText);
    console.log(`[API] 📥 Response Headers:`, {
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    });

    // Handle 404 immediately
    if (response.status === 404) {
      const responseText = await response.text();
      console.error(`[API] ❌ 404 Not Found - endpoint does not exist`);
      console.error(`[API] URL attempted:`, `${baseUrl}${endpoint}`);
      console.error(`[API] Response:`, responseText.substring(0, 200));
      
      return NextResponse.json(
        {
          error: `Kotak API endpoint not found (404)`,
          details: `The endpoint ${endpoint} does not exist`,
          url: `${baseUrl}${endpoint}`,
          baseUrl,
          endpoint,
          action,
          hint: 'Check if baseUrl is correct and endpoint path is valid for your Kotak account type',
        },
        { status: 404 }
      );
    }

    let data;
    let responseText = '';
    try {
      responseText = await response.text();
      console.log(`[API] 📥 Raw response (first 500 chars):`, responseText.substring(0, 500));
      
      // Check if response is actually JSON
      if (!responseText || !responseText.trim()) {
        throw new Error('Empty response from Kotak API');
      }

      // Try to parse as JSON
      if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
        data = JSON.parse(responseText);
      } else {
        // Not JSON - might be HTML error page or plain text
        console.error(`[API] 📥 Response is not JSON, it's:`, responseText.substring(0, 500));
        return NextResponse.json(
          {
            error: `Non-JSON response from Kotak API (HTTP ${response.status})`,
            details: `Expected JSON but got: ${response.headers.get('content-type')}`,
            url: `${baseUrl}${endpoint}`,
            raw: responseText.substring(0, 500),
            statusText: response.statusText,
          },
          { status: response.status || 500 }
        );
      }
    } catch (parseErr) {
      console.error(`[API] 📥 Failed to process response:`, parseErr);
      return NextResponse.json(
        {
          error: `Invalid response from Kotak API`,
          details: parseErr instanceof Error ? parseErr.message : 'Unknown parse error',
          contentType: response.headers.get('content-type'),
          statusCode: response.status,
          statusText: response.statusText,
          url: `${baseUrl}${endpoint}`,
          raw: responseText.substring(0, 300),
        },
        { status: 502 }
      );
    }

    console.log(`[API] 📥 Trading POST Response Data:`, data);

    // Check for Kotak API success (stCode === 200 means success)
    if (data?.stCode === 200) {
      console.log(`[API] ✅ Kotak API Success:`, {
        orderId: data.nOrdNo,
        status: data.stat,
        stCode: data.stCode,
      });
      
      return NextResponse.json({
        success: true,
        data: {
          nOrdNo: data.nOrdNo,
          stat: data.stat,
          stCode: data.stCode,
        },
      });
    }

    // Check for Kotak API error responses
    if (data?.stCode && data.stCode !== 200) {
      console.error(`[API] ❌ Kotak API returned error code:`, data.stCode);
      return NextResponse.json(
        {
          error: `Kotak API Error (${data.stCode}): ${data.emsg || data.message || 'Unknown error'}`,
          details: data,
        },
        { status: 400 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Trading ${action} failed (HTTP ${response.status}): ${response.statusText}`,
          details: data,
        },
        { status: response.status }
      );
    }

    console.log(`[API] ✅ Trading ${action} successful`);

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error('[API] Trading POST error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute trading POST request',
      },
      { status: 500 }
    );
  }
}
