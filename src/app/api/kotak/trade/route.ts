// src/app/api/kotak/trade/route.ts
/**
 * Next.js API Route for Kotak Trading Operations
 *
 * Proxies trading requests to Kotak Neo API from the browser.
 * Successful orders are logged to the Supabase trade_logs table.
 * Trading rules are enforced BEFORE any order reaches the Kotak Neo API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tradesRulesEngine } from '@/lib/rules/TradesRulesEngine_v2';
import { OrderRequest, OrderSide, OrderType, ProductType } from '@/types/broker.types';
import { createClient } from '@supabase/supabase-js';

// ── Supabase admin client (server-side only) ─────────────────────────────────
// Uses the service role key so it bypasses RLS and always saves the log,
// regardless of the user's auth state. Never exposed to the browser.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('[API] ⚠️ Supabase env vars missing — trade_logs will not be saved.');
    console.error('[API] Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ── Save a successfully placed order to trade_logs AND trades ───────────────
async function logTradeToSupabase({
  orderId,
  symbol,
  tradingSymbol,
  exchange,
  side,
  quantity,
  price,
  orderType,
  productType,
  userId,
}: {
  orderId: string;
  symbol: string;
  tradingSymbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number;
  orderType: string;
  productType: string;
  userId: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const sideLabel = side === 'B' || side === 'BUY' ? 'BUY' : 'SELL';
  const now = new Date().toISOString();

  // ── 1. trade_logs (simple audit log, no user_id required) ────────────────
  try {
    const { error } = await supabase.from('trade_logs').insert({
      order_id:    orderId,
      symbol:      tradingSymbol || symbol,
      exchange:    exchange,
      side:        sideLabel,
      quantity:    quantity,
      price:       price || 0,
      pnl:         0,
      timestamp:   now,
      broker_name: 'Kotak Neo',
    });

    if (error) {
      if (error.code === '23505') {
        console.log(`[API] ℹ️ trade_logs: order ${orderId} already exists — skipping.`);
      } else {
        console.error('[API] ❌ trade_logs insert failed:', error.message);
      }
    } else {
      console.log(`[API] ✅ trade_logs saved — orderId: ${orderId}`);
    }
  } catch (err) {
    console.error('[API] ❌ Exception saving trade_log:', err);
  }

  // ── 2. trades (dashboard source of truth, requires user_id) ──────────────
  if (!userId) {
    console.warn('[API] ⚠️ No userId provided — skipping trades insert. Dashboard will not update.');
    return;
  }

  try {
    const { error } = await supabase.from('trades').insert({
      user_id:          userId,
      symbol:           symbol,
      trading_symbol:   tradingSymbol || symbol,
      side:             sideLabel,
      quantity:         quantity,
      entry_price:      price > 0 ? price : 0.01,   // entry_price must be > 0 per constraint
      exit_price:       null,
      order_type:       orderType  || 'LIMIT',
      product_type:     productType || 'MIS',
      exchange_segment: exchange,
      status:           'OPEN',
      entry_timestamp:  now,
      pnl:              0,
      pnl_percentage:   0,
      notes:            `Order ID: ${orderId}`,
    });

    if (error) {
      if (error.code === '23505') {
        console.log(`[API] ℹ️ trades: duplicate entry for order ${orderId} — skipping.`);
      } else {
        console.error('[API] ❌ trades insert failed:', error.message, error.details);
      }
    } else {
      console.log(`[API] ✅ trades saved — symbol: ${tradingSymbol}, side: ${sideLabel}, qty: ${quantity}, price: ${price}`);
    }
  } catch (err) {
    console.error('[API] ❌ Exception saving trade:', err);
  }
}

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
          return NextResponse.json({ error: 'Missing symbol parameter for getLTP' }, { status: 400 });
        }
        endpoint = `/oms/v1/quote/ltp/${symbol}`;
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const url = `${baseUrl}${endpoint}`;
    console.log(`[API] 📤 Trading GET request:`, { url, action });

    const kotakHeaders: Record<string, string> = {
      'accept': 'application/json',
      'Authorization': consumerKey,
      'neo-fin-key': 'neotradeapi',
      'Sid': tradingSid,
      'Auth': tradingToken,
    };

    let fetchMethod = 'GET';
    let fetchBody: string | undefined = undefined;
    let fetchHeaders = { ...kotakHeaders };

    if (action === 'getBalance' || action === 'getUserLimits') {
      fetchMethod = 'POST';
      fetchBody = 'jData={"seg":"ALL","exch":"ALL","prod":"ALL"}';
      fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (action === 'getPositions') {
      fetchMethod = 'POST';
      fetchBody = 'jData={}';
      fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    }

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

    if (data?.stCode && data.stCode !== 200) {
      const noDataCodes = [5203, 5204];
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

    if (data?.stat === 'Not_Ok') {
      const emsg = (data.emsg || data.errMsg || '').toLowerCase();
      if (emsg.includes('no data') || emsg.includes('no record') || emsg.includes('empty') || emsg.includes('data not found')) {
        console.log(`[API] ℹ️ ${action} returned no data (empty):`, data.emsg);
        return NextResponse.json({ success: true, data: { stat: 'Ok', stCode: 200, data: [] } });
      }
      console.error(`[API] ❌ ${action} Kotak stat error:`, data.emsg || data.errMsg);
      return NextResponse.json(
        { error: `${action} failed: ${data.emsg || data.errMsg || 'Kotak API error'}`, details: data },
        { status: 400 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `${action} failed (HTTP ${response.status}): ${response.statusText}`, details: data },
        { status: response.status }
      );
    }

    console.log(`[API] ✅ ${action} successful`);
    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[API] Trading GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute trading GET request' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, tradingToken, tradingSid, baseUrl, consumerKey, ...operationData } = body;

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
      case 'placeOrderblocking': {
        // ── Trading Rules Gate ───────────────────────────────────────────
        const orderSymbol: string = operationData.ts || '';
        const orderSideRaw: string = (operationData.tt || '').toUpperCase();
        const orderQty: number = Number(operationData.qty) || 0;
        const orderPrice: number = Number(operationData.pr) || 0;

        const orderSide: OrderSide =
          orderSideRaw === 'B' || orderSideRaw === 'BUY' ? OrderSide.BUY : OrderSide.SELL;

        const orderRequest: OrderRequest = {
          symbol:      orderSymbol,
          exchange:    operationData.es || 'nse_fo',
          side:        orderSide,
          quantity:    orderQty,
          orderType:   OrderType.MARKET,
          productType: ProductType.MARGIN,
          price:       orderPrice || undefined,
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

        endpoint = '/quick/order/rule/ms/place';
        useFormEncoded = true;

        let kotakOrderType = operationData.pt;
        if (operationData.pt === 'MARKET')      kotakOrderType = 'MKT';
        else if (operationData.pt === 'LIMIT')  kotakOrderType = 'LMT';
        else if (operationData.pt === 'SL')     kotakOrderType = 'SL';
        else if (operationData.pt === 'SL-M')   kotakOrderType = 'SL-M';

        requestBody = {
          jData: JSON.stringify({
            am:  operationData.am  || 'NO',
            dq:  operationData.dq  || '0',
            es:  operationData.es,
            mp:  operationData.mp  || '0',
            pc:  operationData.pc,
            pf:  operationData.pf  || 'N',
            pr:  operationData.pr  || '0',
            pt:  kotakOrderType,
            qt:  operationData.qty,
            rt:  operationData.rt  || 'DAY',
            tp:  operationData.tp  || '0',
            ts:  operationData.ts,
            tt:  operationData.tt,
          }),
        };
        break;
      }

          case 'placeOrder': {
      endpoint = '/quick/order/rule/ms/place';
      useFormEncoded = true;

      let kotakOrderType = operationData.pt;
      if (operationData.pt === 'MARKET')      kotakOrderType = 'MKT';
      else if (operationData.pt === 'LIMIT')  kotakOrderType = 'LMT';
      else if (operationData.pt === 'SL')     kotakOrderType = 'SL';
      else if (operationData.pt === 'SL-M')   kotakOrderType = 'SL-M';

      requestBody = {
        jData: JSON.stringify({
          am:  operationData.am  || 'NO',
          dq:  operationData.dq  || '0',
          es:  operationData.es,
          mp:  operationData.mp  || '0',
          pc:  operationData.pc,
          pf:  operationData.pf  || 'N',
          pr:  operationData.pr  || '0',
          pt:  kotakOrderType,
          qt:  operationData.qty,
          rt:  operationData.rt  || 'DAY',
          tp:  operationData.tp  || '0',
          ts:  operationData.ts,
          tt:  operationData.tt,
        }),
      };
      break;
    }
        case 'modifyOrder':
          endpoint = '/quick/order/vr/modify';       
          useFormEncoded = true;
          requestBody = {
            jData: JSON.stringify({
              tk:  operationData.tk,
              mp:  operationData.mp  || '0',
              pc:  operationData.pc,
              dd:  operationData.dd  || 'NA',
              dq:  operationData.dq  || '0',
              vd:  operationData.vd  || operationData.rt || 'DAY',
              ts:  operationData.ts,
              tt:  operationData.tt,
              pr:  operationData.pr,
              tp:  operationData.tp  || '0',
              qt:  operationData.qt  || operationData.qty,
              no:  operationData.no,                   
              es:  operationData.es,
              pt:  operationData.pt,
              ...(operationData.fq ? { fq: operationData.fq } : {}),
            }),
          };
          break;

        case 'cancelOrder': {
          const isBracketOrder = operationData.pc === 'BO';
          const isCoverOrder   = operationData.pc === 'CO';

          if (isBracketOrder) {
            endpoint = '/quick/order/bo/exit';          
          } else if (isCoverOrder) {
            endpoint = '/quick/order/co/exit';           
          } else {
            endpoint = '/quick/order/cancel';  
          }

          useFormEncoded = true;
          requestBody = {
            jData: JSON.stringify({
              on:  operationData.on || operationData.no, 
              am:  operationData.am || 'NO',
              ...(operationData.am === 'YES' ? { ts: operationData.ts } : {}),
              ...(isBracketOrder && operationData.symOrdId ? { symOrdId: operationData.symOrdId } : {}),
            }),
          };
          break;
        }

      case 'exitPosition':
        endpoint = '/quick/order/rule/ms/exit';
        useFormEncoded = true;
        requestBody = { jData: JSON.stringify(operationData) };
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const url = `${baseUrl}${endpoint}`;
    console.log(`[API] 📤 Trading POST request:`, { url, action, method, body: requestBody });

    let fetchBody: string;
    let contentTypeHeader: string;

    if (useFormEncoded) {
      const params = new URLSearchParams();
      params.append('jData', requestBody.jData);
      fetchBody = params.toString();
      contentTypeHeader = 'application/x-www-form-urlencoded';
      console.log(`[API] 📤 Form-encoded body:`, fetchBody.substring(0, 200));
    } else {
      fetchBody = JSON.stringify(requestBody);
      contentTypeHeader = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': consumerKey,
        'neo-fin-key':   'neotradeapi',
        'Sid':           tradingSid,
        'Auth':          tradingToken,
        'Content-Type':  contentTypeHeader,
      },
      body: fetchBody,
    });

    console.log(`[API] 📥 Trading POST Response Status:`, response.status, response.statusText);

    // Handle 404 immediately
    if (response.status === 404) {
      const responseText = await response.text();
      console.error(`[API] ❌ 404 Not Found:`, `${baseUrl}${endpoint}`);
      return NextResponse.json(
        {
          error: `Kotak API endpoint not found (404)`,
          details: `The endpoint ${endpoint} does not exist`,
          url: `${baseUrl}${endpoint}`,
          hint: 'Check if baseUrl is correct and endpoint path is valid for your Kotak account type',
        },
        { status: 404 }
      );
    }

    let data: any;
    let responseText = '';
    try {
      responseText = await response.text();
      console.log(`[API] 📥 Raw response (first 500 chars):`, responseText.substring(0, 500));

      if (!responseText || !responseText.trim()) throw new Error('Empty response from Kotak API');

      if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
        data = JSON.parse(responseText);
      } else {
        console.error(`[API] 📥 Non-JSON response:`, responseText.substring(0, 500));
        return NextResponse.json(
          {
            error: `Non-JSON response from Kotak API (HTTP ${response.status})`,
            details: `Expected JSON but got: ${response.headers.get('content-type')}`,
            raw: responseText.substring(0, 500),
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
          raw: responseText.substring(0, 300),
        },
        { status: 502 }
      );
    }

    console.log(`[API] 📥 Trading POST Response Data:`, data);

    // ── SUCCESS: stCode 200 ───────────────────────────────────────────────────
    if (data?.stCode === 200) {
      const orderId = data.nOrdNo || `manual-${Date.now()}`;

      console.log(`[API] ✅ Kotak API Success — orderId: ${orderId}`);

      // ── Fire-and-forget: save to trade_logs + trades (never blocks response) ──
      if (action === 'placeOrder') {
        void logTradeToSupabase({
          orderId,
          symbol:        operationData.ts  || '',
          tradingSymbol: operationData.ts  || '',
          exchange:      operationData.es  || '',
          side:          operationData.tt  || '',
          quantity:      Number(operationData.qty) || 0,
          price:         Number(operationData.pr)  || 0,
          orderType:     operationData.pt  || 'LIMIT',
          productType:   operationData.pc  || 'MIS',
          userId:        operationData.userId || '',
        });
      }
      // ─────────────────────────────────────────────────────────────────────

      return NextResponse.json({
        success: true,
        data: {
          nOrdNo:  data.nOrdNo,
          stat:    data.stat,
          stCode:  data.stCode,
        },
      });
    }

    // Kotak API error
    if (data?.stCode && data.stCode !== 200) {
      console.error(`[API] ❌ Kotak API error code:`, data.stCode);
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
        { error: `Trading ${action} failed (HTTP ${response.status}): ${response.statusText}`, details: data },
        { status: response.status }
      );
    }

    console.log(`[API] ✅ Trading ${action} successful`);
    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('[API] Trading POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute trading POST request' },
      { status: 500 }
    );
  }
}