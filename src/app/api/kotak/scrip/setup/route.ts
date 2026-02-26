/**
 * Scrip Master Setup API
 * Allows manual seeding of sample scrip data for development/testing
 * 
 * This endpoint creates sample NSE CM stocks for testing the search functionality
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Sample NSE CM stocks for testing
const SAMPLE_SCRIPPS = [
  { p_symbol: 'INFY', p_exch_seg: 'NSE', p_trd_symbol: 'INFY-EQ', l_lot_size: 1, p_instr_name: 'Infosys Limited', segment: 'nse_cm' },
  { p_symbol: 'TCS', p_exch_seg: 'NSE', p_trd_symbol: 'TCS-EQ', l_lot_size: 1, p_instr_name: 'Tata Consultancy Services', segment: 'nse_cm' },
  { p_symbol: 'RELIANCE', p_exch_seg: 'NSE', p_trd_symbol: 'RELIANCE-EQ', l_lot_size: 1, p_instr_name: 'Reliance Industries Limited', segment: 'nse_cm' },
  { p_symbol: 'HDFC', p_exch_seg: 'NSE', p_trd_symbol: 'HDFC-EQ', l_lot_size: 1, p_instr_name: 'HDFC Bank Limited', segment: 'nse_cm' },
  { p_symbol: 'ICICIBANK', p_exch_seg: 'NSE', p_trd_symbol: 'ICICIBANK-EQ', l_lot_size: 1, p_instr_name: 'ICICI Bank Limited', segment: 'nse_cm' },
  { p_symbol: 'BAJAJFINSV', p_exch_seg: 'NSE', p_trd_symbol: 'BAJAJFINSV-EQ', l_lot_size: 1, p_instr_name: 'Bajaj Finserv Limited', segment: 'nse_cm' },
  { p_symbol: 'LT', p_exch_seg: 'NSE', p_trd_symbol: 'LT-EQ', l_lot_size: 1, p_instr_name: 'Larsen & Toubro Limited', segment: 'nse_cm' },
  { p_symbol: 'MARUTI', p_exch_seg: 'NSE', p_trd_symbol: 'MARUTI-EQ', l_lot_size: 1, p_instr_name: 'Maruti Suzuki India Limited', segment: 'nse_cm' },
  { p_symbol: 'WIPRO', p_exch_seg: 'NSE', p_trd_symbol: 'WIPRO-EQ', l_lot_size: 1, p_instr_name: 'Wipro Limited', segment: 'nse_cm' },
  { p_symbol: 'ASIANPAINT', p_exch_seg: 'NSE', p_trd_symbol: 'ASIANPAINT-EQ', l_lot_size: 1, p_instr_name: 'Asian Paints (India) Limited', segment: 'nse_cm' },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('[SETUP] Initializing Supabase:', {
  url: supabaseUrl ? '✓' : '✗ Missing',
  key: supabaseKey ? '✓' : '✗ Missing',
});

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    console.log(`[SETUP] Received action: ${action}`);

    // Validate Supabase connection first
    if (!supabaseUrl || !supabaseKey) {
      console.error('[SETUP] Missing Supabase credentials');
      return NextResponse.json(
        {
          error: 'Supabase not configured',
          details: `URL: ${supabaseUrl ? '✓' : '✗'}, Key: ${supabaseKey ? '✓' : '✗'}`,
          hint: 'Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file',
        },
        { status: 500 }
      );
    }

    if (action === 'seed-sample') {
      console.log('[SETUP] Seeding sample scrip data...');

      // First, try to read from table to see if it exists
      const { data: testRead, error: tableError } = await supabase
        .from('scrip_master')
        .select('id', { count: 'exact', head: true });

      if (tableError) {
        console.error('[SETUP] Table check error:', tableError);
        return NextResponse.json(
          {
            error: 'scrip_master table not found',
            details: tableError.message,
            hint: 'Run the schema migration in Supabase: https://app.supabase.com/project/YOUR_PROJECT/sql/new',
          },
          { status: 404 }
        );
      }

      // Clear existing data
      console.log('[SETUP] Clearing existing data...');
      const { error: deleteError } = await supabase
        .from('scrip_master')
        .delete()
        .neq('id', 0);

      if (deleteError) {
        console.error('[SETUP] Error clearing data:', deleteError);
        // Continue anyway - might be empty
      }

      // Insert sample data
      console.log('[SETUP] Inserting sample data...');
      const { data, error: insertError } = await supabase
        .from('scrip_master')
        .insert(SAMPLE_SCRIPPS)
        .select();

      if (insertError) {
        console.error('[SETUP] Error inserting data:', insertError);
        return NextResponse.json(
          { 
            error: `Failed to seed data: ${insertError.message}`,
            details: insertError,
          },
          { status: 500 }
        );
      }

      console.log(`[SETUP] Seeded ${data?.length || SAMPLE_SCRIPPS.length} sample scripps`);

      // Try to log the sync (but don't fail if table doesn't exist)
      try {
        await supabase.from('scrip_sync_log').insert({
          synced_at: new Date().toISOString(),
          total_records: SAMPLE_SCRIPPS.length,
          segments: 'nse_cm',
        });
      } catch (e) {
        console.warn('[SETUP] Could not log sync (table might not exist)', e);
      }

      return NextResponse.json({
        success: true,
        message: 'Sample data seeded successfully',
        totalRecords: SAMPLE_SCRIPPS.length,
        records: SAMPLE_SCRIPPS,
      });
    } else if (action === 'clear') {
      console.log('[SETUP] Clearing all scrip data...');
      const { error } = await supabase.from('scrip_master').delete().neq('id', 0);
      
      if (error) {
        console.error('[SETUP] Error clearing data:', error);
        return NextResponse.json(
          { error: `Failed to clear data: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'All scrip data cleared',
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "seed-sample" or "clear"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[SETUP] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Setup failed',
        type: error instanceof Error ? error.constructor.name : 'Unknown',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'sample-list') {
      return NextResponse.json({
        samples: SAMPLE_SCRIPPS,
        count: SAMPLE_SCRIPPS.length,
      });
    } else {
      return NextResponse.json({
        available_actions: ['seed-sample', 'clear'],
        endpoints: {
          'POST /api/kotak/scrip/setup': 'seed-sample or clear action',
          'GET /api/kotak/scrip/setup?action=sample-list': 'Get list of sample data',
        },
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
}
