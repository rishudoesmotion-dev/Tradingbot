// src/app/api/kotak/login/route.ts
/**
 * Next.js API Route for Kotak Authentication
 * 
 * Proxies requests to Kotak Neo API from the browser
 * This bypasses CORS issues by routing through the server
 * 
 * Endpoints:
 * - POST /api/kotak/login/totp - Validate TOTP (Step 2a)
 * - POST /api/kotak/login/mpin - Validate MPIN (Step 2b)
 */

import { NextRequest, NextResponse } from 'next/server';

const KOTAK_API_BASE = 'https://mis.kotaksecurities.com';
const NEO_FIN_KEY = 'neotradeapi';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { step, consumerKey, mobileNumber, ucc, totp, mpin, viewToken, viewSid } = body;

    console.log(`[API] Kotak ${step} request received`);

    if (step === 'totp') {
      // Step 2a: TOTP Validation
      return await validateTotp(consumerKey, mobileNumber, ucc, totp);
    } else if (step === 'mpin') {
      // Step 2b: MPIN Validation
      return await validateMpin(consumerKey, viewToken, viewSid, mpin);
    } else {
      return NextResponse.json(
        { error: 'Invalid step. Use "totp" or "mpin"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[API] Kotak login error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

async function validateTotp(
  consumerKey: string,
  mobileNumber: string,
  ucc: string,
  totp: string
) {
  try {
    const url = `${KOTAK_API_BASE}/login/1.0/tradeApiLogin`;
    const requestBody = {
      mobileNumber,
      ucc,
      totp,
    };

    console.log(`[API] 📤 TOTP Request to Kotak:`, { url, mobileNumber, ucc });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'neo-fin-key': NEO_FIN_KEY,
        'Authorization': consumerKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[API] 📥 TOTP Response Status:`, response.status, response.statusText);

    const data = await response.json();
    console.log(`[API] 📥 TOTP Response Data:`, data);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `TOTP validation failed (${response.status}): ${response.statusText}`,
          details: data,
        },
        { status: response.status }
      );
    }

    if (!data?.data?.token || !data?.data?.sid) {
      return NextResponse.json(
        { error: 'Invalid TOTP response - missing token or sid' },
        { status: 400 }
      );
    }

    console.log(`[API] ✅ TOTP validation successful`);

    return NextResponse.json({
      success: true,
      data: {
        viewToken: data.data.token,
        viewSid: data.data.sid,
        kType: 'View',
        status: 'success',
      },
    });
  } catch (error) {
    console.error('[API] TOTP validation error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to validate TOTP',
      },
      { status: 500 }
    );
  }
}

async function validateMpin(
  consumerKey: string,
  viewToken: string,
  viewSid: string,
  mpin: string
) {
  try {
    const url = `${KOTAK_API_BASE}/login/1.0/tradeApiValidate`;
    const requestBody = {
      mpin,
    };

    console.log(`[API] 📤 MPIN Request to Kotak:`, { url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'neo-fin-key': NEO_FIN_KEY,
        'Authorization': consumerKey,
        'Sid': viewSid,
        'Auth': viewToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[API] 📥 MPIN Response Status:`, response.status, response.statusText);

    const data = await response.json();
    console.log(`[API] 📥 MPIN Response Data:`, data);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `MPIN validation failed (${response.status}): ${response.statusText}`,
          details: data,
        },
        { status: response.status }
      );
    }

    if (!data?.data?.token || !data?.data?.sid || !data?.data?.baseUrl) {
      return NextResponse.json(
        { error: 'Invalid MPIN response - missing required fields' },
        { status: 400 }
      );
    }

    console.log(`[API] ✅ MPIN validation successful`);

    return NextResponse.json({
      success: true,
      data: {
        tradingToken: data.data.token,
        tradingSid: data.data.sid,
        baseUrl: data.data.baseUrl,
        kType: 'Trade',
        status: 'success',
      },
    });
  } catch (error) {
    console.error('[API] MPIN validation error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to validate MPIN',
      },
      { status: 500 }
    );
  }
}
