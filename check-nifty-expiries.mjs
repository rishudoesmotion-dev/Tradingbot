import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://pssjbkaqafnotnmrmbxv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzc2pia2FxYWZub3RubXJtYnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDMyMTgsImV4cCI6MjA4NzUxOTIxOH0.s_jg9Yld6HtEoNHsQLMcE8vGWWQHWJ5TgErpycDpTSU'
);

const nowTs = Math.floor(Date.now() / 1000);
console.log('Now (ts):', nowTs, '=', new Date(nowTs * 1000).toISOString());

// 1) How many NIFTY nse_fo rows total?
const total = await sb.from('scrip_master').select('id', { count: 'exact', head: true })
  .eq('p_symbol', 'NIFTY').eq('segment', 'nse_fo');
console.log('\n[1] Total NIFTY nse_fo rows:', total.count, '| error:', total.error?.message);

// 2) Sample p_trd_symbols (first 20)
const sample = await sb.from('scrip_master')
  .select('p_trd_symbol, l_expiry_date')
  .eq('p_symbol', 'NIFTY').eq('segment', 'nse_fo')
  .order('l_expiry_date', { ascending: true })
  .limit(20);
console.log('\n[2] Sample symbols:');
(sample.data || []).forEach(r => console.log(' ', r.p_trd_symbol, '| expiry_ts:', r.l_expiry_date, '=', r.l_expiry_date ? new Date(r.l_expiry_date * 1000).toISOString().slice(0,10) : 'null'));

// 3) All unique expiry timestamps >= now
const expiries = await sb.from('scrip_master')
  .select('l_expiry_date, p_trd_symbol')
  .eq('p_symbol', 'NIFTY').eq('segment', 'nse_fo')
  .gte('l_expiry_date', nowTs)
  .order('l_expiry_date', { ascending: true });

const tsCounts = new Map();
(expiries.data || []).forEach(r => {
  tsCounts.set(r.l_expiry_date, (tsCounts.get(r.l_expiry_date) || 0) + 1);
});
console.log('\n[3] Unique expiry timestamps >= now:');
tsCounts.forEach((count, ts) => {
  console.log('  ts:', ts, '=', new Date(ts * 1000).toISOString().slice(0,10), '| rows:', count);
});

// 4) All segments available for NIFTY
const segs = await sb.from('scrip_master')
  .select('segment, p_exch_seg')
  .eq('p_symbol', 'NIFTY')
  .limit(10);
console.log('\n[4] NIFTY segments in DB:');
const segSet = new Set((segs.data||[]).map(r => r.segment+'|'+r.p_exch_seg));
segSet.forEach(s => console.log(' ', s));

process.exit(0);
