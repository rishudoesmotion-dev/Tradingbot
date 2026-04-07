/**
 * Scrip Master Sync API
 * Syncs ALL instrument data from Kotak API to Supabase
 * (no symbol / instrument-type / segment filter — full sync)
 *
 * Key notes from Kotak docs:
 * - Authorization header = plain consumerKey token (no tradingToken:tradingSid)
 * - nse_fo lExpiryDate is offset: actual_expiry = lExpiryDate + 315511200
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const KOTAK_LOGIN_BASE  = 'https://mis.kotaksecurities.com';
const NEO_FIN_KEY       = 'neotradeapi';
// nse_fo expiry offset per Kotak docs: add this to raw lExpiryDate to get real Unix timestamp
const NSE_FO_EXPIRY_OFFSET = 315511200;

export const dynamic   = 'force-dynamic';
export const maxDuration = 300;

// ── No symbol/instrument filter — sync everything ───────────────────────────

interface ScripRecord {
  pSymbol: string;
  pExchSeg: string;
  pTrdSymbol: string;
  lLotSize: number;
  pInstrName: string;
  lExpiryDate?: number;
  pTok?: string;
  segment: string;
}

interface ScripMasterRow {
  p_symbol: string;
  p_exch_seg: string;
  p_trd_symbol: string;
  l_lot_size: number;
  p_instr_name: string;
  l_expiry_date?: number;
  p_tok?: string;
  segment: string;
}

function convertRecordToSnakeCase(record: ScripRecord): ScripMasterRow {
  return {
    p_symbol:      record.pSymbol,
    p_exch_seg:    record.pExchSeg,
    p_trd_symbol:  record.pTrdSymbol,
    l_lot_size:    record.lLotSize,
    p_instr_name:  record.pInstrName,
    l_expiry_date: record.lExpiryDate,
    p_tok:         record.pTok || undefined,
    segment:       record.segment,
  };
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function getKotakBaseUrl(consumerKey: string, tradingToken: string, tradingSid: string): Promise<string> {
  const response = await fetch(`${KOTAK_LOGIN_BASE}/tradeApiValidate`, {
    method: 'GET',
    headers: {
      'Authorization': `${tradingToken}:${tradingSid}`,
      'neofin-key': NEO_FIN_KEY,
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
  if (!baseUrl) throw new Error('No baseUrl in tradeApiValidate response');
  console.log('[SYNC] Got base URL:', baseUrl);
  return baseUrl;
}

// ── isNiftyRecord removed — all instruments are synced ───────────────────────

async function downloadAndParseCSV(csvUrl: string, segment: string): Promise<ScripRecord[]> {
  console.log(`[SYNC] Downloading CSV for segment: ${segment}`);

  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error(`Failed to download CSV: ${response.statusText}`);

  const csvText = await response.text();
  const lines   = csvText.trim().split('\n');

  if (lines.length === 0) {
    console.warn(`[SYNC] Empty CSV for segment: ${segment}`);
    return [];
  }

  console.log(`[SYNC] Total lines (incl header): ${lines.length}`);

  // ── Confirmed Kotak nse_fo CSV column positions ────────────────────────────
  // [0]  pTok        — instrument token (used by Quotes & WebSocket APIs)
  // [2]  pExchSeg    — exchange segment (nse_fo)
  // [3]  pInstrName  — instrument type (OPTIDX / FUTIDX / OPTSTK …)
  // [4]  pSymbol     — symbol root (NIFTY, BANKNIFTY, NIFTYNXT50 …)
  // [5]  pTrdSymbol  — trading symbol (used by Orders API as 'ts' field)
  // [16] lLotSize    — lot size (Orders API 'qt' must be multiple of this)
  // [17] lExpiryDate — raw expiry epoch; add NSE_FO_EXPIRY_OFFSET for real date
  // ──────────────────────────────────────────────────────────────────────────

  const nowTs   = Math.floor(Date.now() / 1000);
  const records: ScripRecord[] = [];
  let skippedExpiry = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const v = line.split(',').map(col => col.trim());

    // Direct positional access — confirmed from CSV sample log
    const pInstrName = v[3] || '';
    const pSymbol    = v[4] || '';

    // Skip expired records (for F&O segments that have expiry dates)
    // Per Kotak docs: nse_fo raw lExpiryDate + 315511200 = actual Unix timestamp
    const rawExpiry   = v[17] ? parseInt(v[17]) : undefined;
    const lExpiryDate = rawExpiry !== undefined && rawExpiry > 0
      ? rawExpiry + NSE_FO_EXPIRY_OFFSET
      : undefined;
    if (lExpiryDate !== undefined && lExpiryDate < nowTs) {
      skippedExpiry++;
      continue;
    }

    const pTok       = v[0] || undefined;
    const pExchSeg   = v[2] || segment;
    const pTrdSymbol = v[5] || '';
    const lLotSize   = parseInt(v[16] || '1') || 1;

    records.push({ pSymbol, pExchSeg, pTrdSymbol, lLotSize, pInstrName, lExpiryDate, pTok, segment });
  }

  console.log(`[SYNC] ${segment}: ${records.length} kept | ${skippedExpiry} skipped (expired)`);
  return records;
}

async function syncSegmentData(csvUrl: string, segment: string): Promise<number> {
  const records = await downloadAndParseCSV(csvUrl, segment);

  if (records.length === 0) {
    console.warn(`[SYNC] No records to sync for segment: ${segment}`);
    return 0;
  }

  let rows = records.map(convertRecordToSnakeCase);

  // Deduplicate on p_trd_symbol — trading symbol is unique per contract
  const seen = new Map<string, boolean>();
  rows = rows.filter(r => {
    if (seen.has(r.p_trd_symbol)) return false;
    seen.set(r.p_trd_symbol, true);
    return true;
  });

  console.log(`[SYNC] ${segment}: ${rows.length} unique records after dedup`);

  const batchSize     = 500;
  const maxConcurrent = 3;
  let insertedCount   = 0;

  const batches: ScripMasterRow[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx += maxConcurrent) {
    const concurrent = batches.slice(batchIdx, batchIdx + maxConcurrent);
    await Promise.all(concurrent.map(async (batch, idx) => {
      const actualIdx = batchIdx + idx;
      try {
        // Delete-then-insert to replace stale contracts cleanly
        const trdSymbols = batch.map(r => r.p_trd_symbol);
        await supabase.from('scrip_master').delete().in('p_trd_symbol', trdSymbols);

        const { error } = await supabase.from('scrip_master').insert(batch);
        if (error) {
          console.error(`[SYNC] Insert error batch ${actualIdx}:`, error);
           console.error(`[SYNC] Sample record:`, JSON.stringify(batch[0]));
          // Upsert fallback
          const { error: upsertErr } = await supabase
            .from('scrip_master')
            .upsert(batch, { onConflict: 'p_trd_symbol' });
          if (upsertErr) console.error(`[SYNC] Upsert fallback failed:`, upsertErr);
        }

        insertedCount += batch.length;
        console.log(`[SYNC] ${segment}: ${Math.min((actualIdx + 1) * batchSize, rows.length)}/${rows.length} synced`);
      } catch (err) {
        console.error(`[SYNC] Batch ${actualIdx} error:`, err);
      }
    }));
  }

  return insertedCount;
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

    console.log('[SYNC] Starting full scrip master sync (all segments)...');

    if (fullSync) {
      console.log('[SYNC] Full sync: clearing all existing scrip_master data...');
      await supabase.from('scrip_master').delete().gt('id', 0);
    }

    // Resolve dynamic base URL
    let baseUrl: string;
    if (providedBaseUrl) {
      console.log('[SYNC] Using provided baseUrl:', providedBaseUrl);
      baseUrl = providedBaseUrl;
    } else {
      try {
        baseUrl = await getKotakBaseUrl(consumerKey, tradingToken, tradingSid);
      } catch (error) {
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

    // ── Fetch file paths ───────────────────────────────────────────────────
    // Per Kotak docs: Authorization = plain consumerKey token (not tradingToken:tradingSid)
    const scriptApiUrl = `${baseUrl}/script-details/1.0/masterscrip/file-paths`;
    console.log('[SYNC] Fetching scrip master file paths from:', scriptApiUrl);

    let response: Response;
    try {
      response = await fetch(scriptApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': consumerKey,
          'neofin-key': NEO_FIN_KEY,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      return NextResponse.json(
        {
          error: 'Network error: Unable to reach Kotak API',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        },
        { status: 503 }
      );
    }

    if (!response.ok) {
      const responseText = await response.text();
      console.error('[SYNC] API error response:', responseText);
      return NextResponse.json(
        { error: `Failed to fetch file paths: ${response.statusText}`, details: responseText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const filesPaths: string[] = data?.data?.filesPaths || [];

    if (filesPaths.length === 0) {
      return NextResponse.json({ error: 'No scrip master files found' }, { status: 404 });
    }

    console.log(`[SYNC] Found ${filesPaths.length} file(s):`, filesPaths);

    // ── Process all segments ───────────────────────────────────────────────
    const results: Record<string, number> = {};

    for (const csvUrl of filesPaths) {
      const segmentMatch = csvUrl.match(/(nse_cm|bse_cm|nse_fo|bse_fo|cde_fo)/);
      const segment      = segmentMatch ? segmentMatch[0] : 'unknown';

      console.log(`[SYNC] Processing segment: ${segment}`);
      results[segment] = await syncSegmentData(csvUrl, segment);
    }

    const totalRecords = Object.values(results).reduce((sum, n) => sum + n, 0);

    await supabase.from('scrip_sync_log').insert({
      synced_at:     new Date().toISOString(),
      total_records: totalRecords,
      segments:      Object.keys(results).join(','),
    });

    console.log(`[SYNC] Done. Total records stored across all segments: ${totalRecords}`);

    return NextResponse.json({
      success: true,
      message: 'Scrip master sync completed (all segments)',
      totalRecords,
      breakdown: results,
    });
  } catch (error) {
    console.error('[SYNC] Sync error:', error);
    return NextResponse.json(
      {
        error:   error instanceof Error ? error.message : 'Sync failed',
        details: error instanceof Error ? error.stack   : 'No details',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { data: lastSync } = await supabase
      .from('scrip_sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    const { count } = await supabase
      .from('scrip_master')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      isSynced:     (count ?? 0) > 0,
      lastSync,
      totalRecords: count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { isSynced: false, error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    );
  }
}