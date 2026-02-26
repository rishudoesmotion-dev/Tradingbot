/**
 * Scrip Master Sync API
 * Syncs instrument data from Kotak API to Supabase
 * 
 * This endpoint:
 * 1. Fetches scrip master file paths from Kotak
 * 2. Downloads CSV files for each segment
 * 3. Parses and syncs to Supabase scrip_master table
 * 
 * CONFIGURATION:
 * - Currently enabled: NSE FO (91,209 instruments)
 * - To add more segments, see line ~354 and modify the segments array
 * 
 * Available segments:
 * - 'nse_fo'  : NSE Futures & Options (91,209) - CURRENTLY ENABLED
 * - 'nse_cm'  : NSE Cash Market/Stocks (11,616)
 * - 'bse_fo'  : BSE Futures & Options (46,707)
 * - 'bse_cm'  : BSE Cash Market/Stocks
 * - 'cde_fo'  : Currency Derivatives (11,494)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const KOTAK_LOGIN_BASE = 'https://mis.kotaksecurities.com';
const NEO_FIN_KEY = 'neotradeapi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout

interface ScripRecord {
  pSymbol: string;
  pExchSeg: string;
  pTrdSymbol: string;
  lLotSize: number;
  pInstrName: string;
  lExpiryDate?: number;
  segment: string;
}

// Map camelCase properties to snake_case for Supabase
interface ScripMasterRow {
  p_symbol: string;
  p_exch_seg: string;
  p_trd_symbol: string;
  l_lot_size: number;
  p_instr_name: string;
  l_expiry_date?: number;
  segment: string;
}

function convertRecordToSnakeCase(record: ScripRecord): ScripMasterRow {
  return {
    p_symbol: record.pSymbol,
    p_exch_seg: record.pExchSeg,
    p_trd_symbol: record.pTrdSymbol,
    l_lot_size: record.lLotSize,
    p_instr_name: record.pInstrName,
    l_expiry_date: record.lExpiryDate,
    segment: record.segment,
  };
}

// Initialize Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

/**
 * Get dynamic base URL from Kotak's /tradeApiValidate endpoint
 * This is required before calling any scrip/script endpoints
 */
async function getKotakBaseUrl(consumerKey: string, tradingToken: string, tradingSid: string): Promise<string> {
  try {
    console.log('[SYNC] Fetching base URL from /tradeApiValidate...');
    
    const response = await fetch(`${KOTAK_LOGIN_BASE}/tradeApiValidate`, {
      method: 'GET',
      headers: {
        'Authorization': `${tradingToken}:${tradingSid}`,
        'neofin-key': 'neotradeapi',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SYNC] tradeApiValidate response:', errorText);
      throw new Error(`tradeApiValidate failed: ${response.statusText}`);
    }

    const data = await response.json();
    const baseUrl = data?.data?.baseUrl || data?.baseUrl;

    if (!baseUrl) {
      console.error('[SYNC] No baseUrl in response:', data);
      throw new Error('No baseUrl in tradeApiValidate response');
    }

    console.log('[SYNC] Got base URL:', baseUrl);
    return baseUrl;
  } catch (error) {
    console.error('[SYNC] Error getting base URL:', error);
    throw error;
  }
}

async function downloadAndParseCSV(csvUrl: string, segment: string): Promise<ScripRecord[]> {
  try {
    console.log(`[SYNC] Downloading CSV for segment: ${segment}`);
    
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`Failed to download CSV: ${response.statusText}`);
    }

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    if (lines.length === 0) {
      console.warn(`[SYNC] Empty CSV for segment: ${segment}`);
      return [];
    }

    // Parse header - create case-insensitive key map
    const headerLine = lines[0].split(',').map(h => h.trim());
    const headerMap: Record<string, number> = {};
    
    headerLine.forEach((header, index) => {
      const lowerHeader = header.toLowerCase();
      headerMap[lowerHeader] = index;
    });
    
    console.log(`[SYNC] CSV Headers for ${segment}:`, headerLine);
    console.log(`[SYNC] Header map:`, headerMap);

    // Parse data rows
    const records: ScripRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      // Helper function to get value by fuzzy header matching
      const getValue = (variations: string[]): string => {
        for (const v of variations) {
          const index = headerMap[v.toLowerCase()];
          if (index !== undefined && values[index]) {
            return values[index];
          }
        }
        return '';
      };

      const record: ScripRecord = {
        pSymbol: getValue(['pSymbol', 'symbol', 'psymbol']),
        pExchSeg: getValue(['pExchSeg', 'exch_seg', 'pexchseg', 'exchange_segment']) || segment,
        pTrdSymbol: getValue(['pTrdSymbol', 'trading_symbol', 'ptrdsymbol', 'tradingsymbol']),
        lLotSize: parseInt(getValue(['lLotSize', 'lot_size', 'llotsize', 'lotsize']) || '1'),
        pInstrName: getValue(['pInstrName', 'instr_name', 'pinstru_name', 'pinstrname', 'instrument_name', 'name']),
        lExpiryDate: (() => {
          const val = getValue(['lExpiryDate', 'expiry_date', 'lexpirydate', 'expirydate']);
          return val ? parseInt(val) : undefined;
        })(),
        segment: segment,
      };

      records.push(record);
    }

    console.log(`[SYNC] Parsed ${records.length} records from ${segment}`);
    return records;
  } catch (error) {
    console.error(`[SYNC] Error downloading CSV for ${segment}:`, error);
    return [];
  }
}

async function syncSegmentData(csvUrl: string, segment: string): Promise<number> {
  try {
    // Download and parse CSV
    const records = await downloadAndParseCSV(csvUrl, segment);

    if (records.length === 0) {
      console.warn(`[SYNC] No records to sync for segment: ${segment}`);
      return 0;
    }

    // Convert to snake_case for Supabase
    let snakeCaseRecords = records.map(convertRecordToSnakeCase);

    // Deduplicate records within the batch
    // Use a Map to keep only the first occurrence of each (p_symbol, p_exch_seg) combination
    const seen = new Map<string, boolean>();
    snakeCaseRecords = snakeCaseRecords.filter(record => {
      const key = `${record.p_symbol}|${record.p_exch_seg}`;
      if (seen.has(key)) {
        return false; // Skip duplicate
      }
      seen.set(key, true);
      return true;
    });

    console.log(`[SYNC] After deduplication for ${segment}: ${snakeCaseRecords.length} unique records`);

    // Batch upsert to Supabase (max 500 at a time - reduced from 1000 for safety)
    const batchSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < snakeCaseRecords.length; i += batchSize) {
      const batch = snakeCaseRecords.slice(i, i + batchSize);
      
      // Use insert instead of upsert to avoid duplicate key issues
      // First delete any existing records to ensure clean sync
      const symbolsList = batch.map(r => r.p_symbol);
      
      try {
        await supabase
          .from('scrip_master')
          .delete()
          .in('p_symbol', symbolsList);
      } catch (deleteErr) {
        // Continue even if delete fails
        console.warn(`[SYNC] Delete warning for ${segment}:`, deleteErr);
      }

      // Now insert the batch
      const { error } = await supabase
        .from('scrip_master')
        .insert(batch);

      if (error) {
        console.error(`[SYNC] Error inserting batch for ${segment}:`, error);
        // Try one more time with upsert as fallback
        const { error: upsertError } = await supabase
          .from('scrip_master')
          .upsert(batch, { onConflict: 'p_symbol,p_exch_seg' });

        if (upsertError) {
          console.error(`[SYNC] Upsert fallback also failed for ${segment}:`, upsertError);
          // Continue with next batch
          continue;
        }
      }

      insertedCount += batch.length;
      console.log(`[SYNC] Synced ${insertedCount}/${snakeCaseRecords.length} records for ${segment}`);
    }

    return insertedCount;
  } catch (error) {
    console.error(`[SYNC] Error syncing segment ${segment}:`, error);
    return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { consumerKey, tradingToken, tradingSid, baseUrl: providedBaseUrl, fullSync } = await request.json();

    if (!consumerKey || !tradingToken || !tradingSid) {
      return NextResponse.json(
        { error: 'Missing required fields: consumerKey, tradingToken, tradingSid' },
        { status: 400 }
      );
    }

    console.log('[SYNC] Starting scrip master sync...');

    // If fullSync, clear existing data
    if (fullSync) {
      console.log('[SYNC] Clearing existing data for full sync...');
      await supabase.from('scrip_master').delete().neq('id', 0); // Delete all
    }

    // Get dynamic base URL from Kotak
    let baseUrl: string;
    
    if (providedBaseUrl) {
      console.log('[SYNC] Using provided baseUrl:', providedBaseUrl);
      baseUrl = providedBaseUrl;
    } else {
      try {
        baseUrl = await getKotakBaseUrl(consumerKey, tradingToken, tradingSid);
      } catch (error) {
        console.error('[SYNC] Failed to get base URL:', error);
        return NextResponse.json(
          {
            error: 'Failed to get Kotak API base URL',
            details: error instanceof Error ? error.message : 'Unknown error',
            note: 'Ensure tradingToken and tradingSid are valid',
          },
          { status: 401 }
        );
      }
    }

    // Fetch file paths from Kotak using dynamic base URL
    const scriptApiUrl = `${baseUrl}/script-details/1.0/masterscrip/file-paths`;
    console.log('[SYNC] Fetching scrip master file paths...');
    console.log('[SYNC] API URL:', scriptApiUrl);
    
    let response;
    try {
      // Try with trading token:sid first
      response = await fetch(scriptApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `${tradingToken}:${tradingSid}`,
          'neofin-key': 'neotradeapi',
          'Content-Type': 'application/json',
        },
      });

      // If 424 Failed Dependency, try with consumerKey only
      if (response.status === 424) {
        console.log('[SYNC] Got 424, retrying with consumerKey header...');
        response = await fetch(scriptApiUrl, {
          method: 'GET',
          headers: {
            'Authorization': consumerKey,
            'neofin-key': 'neotradeapi',
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (fetchError) {
      console.error('[SYNC] Network error:', fetchError);
      return NextResponse.json(
        {
          error: 'Network error: Unable to reach Kotak API',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
          note: 'Please check your internet connection',
        },
        { status: 503 }
      );
    }

    if (!response.ok) {
      const responseText = await response.text();
      console.error('[SYNC] API error response:', responseText);
      return NextResponse.json(
        {
          error: `Failed to fetch file paths: ${response.statusText}`,
          details: responseText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const filesPaths = data?.data?.filesPaths || [];

    if (filesPaths.length === 0) {
      return NextResponse.json(
        { error: 'No scrip master files found' },
        { status: 404 }
      );
    }

    console.log(`[SYNC] Found ${filesPaths.length} scrip master files`);

    // Sync each segment
    // Currently enabled: NSE FO only
    // To enable other segments later, add them to this array:
    // ['nse_fo', 'nse_cm', 'bse_fo', 'bse_cm', 'cde_fo']
    const results: Record<string, number> = {};
    const segments = ['nse_fo']; // CHANGE THIS TO ADD MORE SEGMENTS

    for (const csvUrl of filesPaths) {
      // Extract segment from URL
      const segmentMatch = csvUrl.match(/(nse_cm|bse_cm|nse_fo|bse_fo|cde_fo)/);
      const segment = segmentMatch ? segmentMatch[0] : 'unknown';

      if (segments.includes(segment)) {
        console.log(`[SYNC] Processing segment: ${segment}`);
        const count = await syncSegmentData(csvUrl, segment);
        results[segment] = count;
      }
    }

    // Log sync completion
    const totalRecords = Object.values(results).reduce((sum, count) => sum + count, 0);
    
    await supabase.from('scrip_sync_log').insert({
      synced_at: new Date().toISOString(),
      total_records: totalRecords,
      segments: Object.keys(results).join(','),
    });

    console.log(`[SYNC] Sync complete! Total records: ${totalRecords}`);

    return NextResponse.json({
      success: true,
      message: 'Scrip master sync completed',
      totalRecords,
      breakdown: results,
    });
  } catch (error) {
    console.error('[SYNC] Sync error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Sync failed',
        details: error instanceof Error ? error.stack : 'No details available',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get sync status
    const { data: lastSync } = await supabase
      .from('scrip_sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    const { data: recordCount } = await supabase
      .from('scrip_master')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      isSynced: recordCount && recordCount.length > 0,
      lastSync,
      totalRecords: recordCount?.length || 0,
    });
  } catch (error) {
    console.error('[SYNC] Status check error:', error);
    return NextResponse.json(
      {
        isSynced: false,
        error: error instanceof Error ? error.message : 'Status check failed',
      },
      { status: 500 }
    );
  }
}
