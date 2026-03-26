#!/usr/bin/env node

/**
 * Sync Script Master Data
 * 
 * This script downloads the latest scrip master CSV files from Kotak API
 * and stores them in the database for fast symbol lookups
 * 
 * Usage: npx ts-node scripts/sync-scrips.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const KOTAK_CONSUMER_KEY = process.env.KOTAK_CONSUMER_KEY || '';

interface ScripMasterRecord {
  pSymbol: string;
  pExchSeg: string;
  pTrdSymbol: string;
  lLotSize: number;
  pInstrName: string;
  lExpiryDate?: number;
  /** Instrument token (pTok). Required by Quotes neosymbol API for F&O segments. */
  pTok?: string;
  segment: string;
}

async function downloadScripMaster(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase credentials in environment');
  }

  if (!KOTAK_CONSUMER_KEY) {
    throw new Error('Missing KOTAK_CONSUMER_KEY in environment');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('📥 Fetching scrip master file paths from Kotak API...');

  // Get file paths from Kotak
  const response = await fetch(
    'https://api.kotaksecurities.com/script-details/1.0/masterscrip/file-paths',
    {
      headers: {
        'Authorization': KOTAK_CONSUMER_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch file paths: ${response.statusText}`);
  }

  const data = await response.json();
  const filePaths: string[] = data.data?.filesPaths || [];

  if (filePaths.length === 0) {
    throw new Error('No scrip master files found');
  }

  console.log(`✅ Found ${filePaths.length} scrip master files`);

  let totalRecords = 0;
  const errors: string[] = [];

  // Download and process each CSV file
  for (const fileUrl of filePaths) {
    try {
      const segment = extractSegmentFromUrl(fileUrl);
      console.log(`\n📥 Processing ${segment}...`);

      // Download CSV
      const csvResponse = await fetch(fileUrl);
      if (!csvResponse.ok) {
        throw new Error(`Failed to download ${fileUrl}`);
      }

      const csvText = await csvResponse.text();
      const records = parseCSV(csvText, segment);

      console.log(`   ✓ Parsed ${records.length} records`);

      if (records.length === 0) {
        continue;
      }

      // Clear old records for this segment
      await supabase
        .from('scrip_master')
        .delete()
        .eq('segment', segment);

      console.log(`   ✓ Cleared old records for ${segment}`);

      // Insert new records in batches (map to snake_case for Supabase)
      const batchSize = 500;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize).map(r => ({
          p_symbol:     r.pSymbol,
          p_exch_seg:   r.pExchSeg,
          p_trd_symbol: r.pTrdSymbol,
          l_lot_size:   r.lLotSize,
          p_instr_name: r.pInstrName,
          l_expiry_date: r.lExpiryDate,
          p_tok:        r.pTok || null,
          segment:      r.segment,
        }));
        const { error } = await supabase
          .from('scrip_master')
          .insert(batch);

        if (error) {
          throw error;
        }

        console.log(`   ✓ Inserted ${Math.min(batchSize, records.length - i)}/${records.length} records`);
      }

      totalRecords += records.length;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`   ✗ Error processing file: ${errorMsg}`);
      errors.push(`${extractSegmentFromUrl(fileUrl)}: ${errorMsg}`);
    }
  }

  console.log(`\n✅ Sync complete!`);
  console.log(`   Total records inserted: ${totalRecords}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    errors.forEach(err => console.log(`   - ${err}`));
  }

  // Update sync metadata
  const { error } = await supabase
    .from('scrip_sync_log')
    .insert({
      synced_at: new Date().toISOString(),
      total_records: totalRecords,
      status: errors.length === 0 ? 'success' : 'partial',
    });

  if (error) {
    console.error('Failed to log sync:', error);
  }
}

function extractSegmentFromUrl(url: string): string {
  // Extract segment from URL like: .../nse_fo.csv or .../bse_cm-v1.csv
  const match = url.match(/\/([a-z]+_[a-z]+(?:-v\d+)?)\./);
  return match ? match[1] : 'unknown';
}

function parseCSV(csvText: string, segment: string): ScripMasterRecord[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const records: ScripMasterRecord[] = [];

  // Find column indices (case-sensitive first, fallback to lowercase compare)
  const findIdx = (...names: string[]) => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const pSymbolIdx      = findIdx('pSymbol', 'symbol');
  const pExchSegIdx     = findIdx('pExchSeg', 'exch_seg', 'exchange_segment');
  const pTrdSymbolIdx   = findIdx('pTrdSymbol', 'trading_symbol', 'tradingsymbol');
  const lLotSizeIdx     = findIdx('lLotSize', 'lot_size', 'lotsize');
  const pInstrNameIdx   = findIdx('pInstrName', 'instr_name', 'instrument_name', 'name');
  const lExpiryDateIdx  = findIdx('lExpiryDate', 'expiry_date', 'expirydate');
  // Instrument token — needed by Quotes neosymbol API for F&O
  const pTokIdx         = findIdx('pTok', 'tok', 'token', 'instrument_token');

  if (pSymbolIdx === -1 || pTrdSymbolIdx === -1) {
    throw new Error('CSV missing required columns (pSymbol, pTrdSymbol)');
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());

    if (values.length < pSymbolIdx + 1) continue;

    records.push({
      pSymbol:     values[pSymbolIdx],
      pExchSeg:    pExchSegIdx !== -1 ? values[pExchSegIdx] : segment,
      pTrdSymbol:  values[pTrdSymbolIdx],
      lLotSize:    lLotSizeIdx !== -1 ? parseInt(values[lLotSizeIdx]) || 1 : 1,
      pInstrName:  pInstrNameIdx !== -1 ? values[pInstrNameIdx] : '',
      lExpiryDate: lExpiryDateIdx !== -1 ? parseInt(values[lExpiryDateIdx]) : undefined,
      pTok:        pTokIdx !== -1 && values[pTokIdx] ? values[pTokIdx] : undefined,
      segment:     segment,
    });
  }

  return records;
}

// Run the sync
downloadScripMaster()
  .then(() => {
    console.log('\n🎉 Scrip master sync completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Sync failed:', error);
    process.exit(1);
  });
