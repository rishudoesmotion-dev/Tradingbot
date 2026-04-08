// src/app/api/kotak/scrip/route.ts
/**
 * Next.js API Route for Kotak Scrip Master
 * 
 * Provides access to instrument master data for symbol lookups
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const KOTAK_SCRIPT_API = 'https://api.kotaksecurities.com/script-details/1.0/masterscrip/file-paths';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const consumerKey = searchParams.get('consumerKey');
    const action = searchParams.get('action');


    if (!consumerKey) {
      return NextResponse.json(
        { error: 'Missing required parameter: consumerKey' },
        { status: 400 }
      );
    }

    if (action === 'getScripMasterPaths') {
      // Get scrip master file paths
      const response = await fetch(KOTAK_SCRIPT_API, {
        method: 'GET',
        headers: {
          'Authorization': consumerKey,
          'Content-Type': 'application/json',
        },
      });


      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(
          {
            error: `Failed to fetch scrip master paths: ${response.statusText}`,
            details: data,
          },
          { status: response.status }
        );
      }


      return NextResponse.json({
        success: true,
        data: data.data,
      });
    } else {
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[API] Scrip error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process scrip request',
      },
      { status: 500 }
    );
  }
}
