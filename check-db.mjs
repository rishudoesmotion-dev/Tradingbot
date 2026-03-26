import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://pssjbkaqafnotnmrmbxv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzc2pia2FxYWZub3RubXJtYnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDMyMTgsImV4cCI6MjA4NzUxOTIxOH0.s_jg9Yld6HtEoNHsQLMcE8vGWWQHWJ5TgErpycDpTSU'
);

// Get all unique NIFTY weekly CE symbols to understand the format
const r = await sb.from('scrip_master')
  .select('p_trd_symbol,p_symbol,segment,p_tok,l_expiry_date,l_lot_size,p_exch_seg')
  .ilike('p_trd_symbol', 'NIFTY26%CE')
  .order('l_expiry_date', { ascending: true })
  .limit(20);

console.log('NIFTY 2026 CE symbols:');
(r.data || []).forEach(row => {
  console.log(row.p_trd_symbol, '| p_symbol:', row.p_symbol, '| tok:', row.p_tok, '| expiry:', row.l_expiry_date, '| lot:', row.l_lot_size, '| seg:', row.segment, '| exch_seg:', row.p_exch_seg);
});

process.exit(0);
