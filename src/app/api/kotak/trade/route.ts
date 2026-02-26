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
 */

import { NextRequest, NextResponse } from 'next/server';

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
        endpoint = '/oms/v1/portfolio/positions';
        break;
      case 'getOrders':
        endpoint = '/oms/v1/orders/';
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

    // Special handling for getUserLimits - it needs POST with jData
    if (action === 'getBalance' || action === 'getUserLimits') {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': consumerKey,
          'neo-fin-key': 'neotradeapi',
          'Sid': tradingSid,
          'Auth': tradingToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'jData={"seg":"ALL","exch":"ALL","prod":"ALL"}',
      });

      console.log(`[API] 📥 Trading GET Response Status:`, response.status, response.statusText);

      const data = await response.json();
      console.log(`[API] 📥 Trading GET Response Data:`, data);

      if (!response.ok || data.stCode !== 200) {
        return NextResponse.json(
          {
            error: `Trading ${action} failed: ${data.emsg || response.statusText}`,
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
    }

    // Regular GET requests for other actions
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': consumerKey,
        'neo-fin-key': 'neotradeapi',
        'Sid': tradingSid,
        'Auth': tradingToken,
        'Content-Type': 'application/json',
      },
    });

    console.log(`[API] 📥 Trading GET Response Status:`, response.status, response.statusText);

    const data = await response.json();
    console.log(`[API] 📥 Trading GET Response Data:`, data);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Trading ${action} failed (${response.status}): ${response.statusText}`,
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

    switch (action) {
      case 'placeOrder':
        endpoint = '/oms/v1/orders/regular/place';
        break;
      case 'modifyOrder':
        endpoint = '/oms/v1/orders/regular/modify';
        break;
      case 'cancelOrder':
        endpoint = '/oms/v1/orders/cancel';
        method = 'PUT';
        break;
      case 'exitPosition':
        endpoint = '/oms/v1/positions/exit';
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

    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': consumerKey,
        'neo-fin-key': 'neotradeapi',
        'Sid': tradingSid,
        'Auth': tradingToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[API] 📥 Trading POST Response Status:`, response.status, response.statusText);

    const data = await response.json();
    console.log(`[API] 📥 Trading POST Response Data:`, data);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Trading ${action} failed (${response.status}): ${response.statusText}`,
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
