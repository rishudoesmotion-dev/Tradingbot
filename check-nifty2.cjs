const https = require('https');

const SUPABASE_URL = 'https://pssjbkaqafnotnmrmbxv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzc2pia2FxYWZub3RubXJtYnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDMyMTgsImV4cCI6MjA4NzUxOTIxOH0.s_jg9Yld6HtEoNHsQLMcE8vGWWQHWJ5TgErpycDpTSU';

function query(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/rest/v1/' + path,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact',
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '[]'), headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

const nowTs = Math.floor(Date.now() / 1000);
console.log('Now ts:', nowTs, '=', new Date().toISOString());

async function main() {
  // 1. Count all NIFTY nse_fo rows
  const r1 = await query('scrip_master?p_symbol=eq.NIFTY&segment=eq.nse_fo&select=id&limit=1');
  console.log('\n[1] Status:', r1.status, '| content-range:', r1.headers['content-range']);

  // 2. Sample 20 symbols ordered by expiry
  const r2 = await query('scrip_master?p_symbol=eq.NIFTY&segment=eq.nse_fo&select=p_trd_symbol,l_expiry_date&order=l_expiry_date.asc&limit=20');
  console.log('\n[2] Sample NIFTY nse_fo symbols:');
  (r2.data || []).forEach(r => console.log(' ', r.p_trd_symbol, '| expiry:', r.l_expiry_date, r.l_expiry_date ? '= '+new Date(r.l_expiry_date*1000).toISOString().slice(0,10) : ''));

  // 3. Unique segments for NIFTY
  const r3 = await query('scrip_master?p_symbol=eq.NIFTY&select=segment,p_exch_seg&limit=20');
  const segSet = new Set((r3.data||[]).map(r => r.segment + '|' + r.p_exch_seg));
  console.log('\n[3] NIFTY segments:', [...segSet]);

  // 4. Expiries >= now
  const r4 = await query('scrip_master?p_symbol=eq.NIFTY&segment=eq.nse_fo&l_expiry_date=gte.' + nowTs + '&select=p_trd_symbol,l_expiry_date&order=l_expiry_date.asc&limit=50');
  const tsCounts = new Map();
  (r4.data||[]).forEach(r => tsCounts.set(r.l_expiry_date, (tsCounts.get(r.l_expiry_date)||0)+1));
  console.log('\n[4] Future expiry timestamps:');
  tsCounts.forEach((count, ts) => console.log('  ts:', ts, '=', ts ? new Date(ts*1000).toISOString().slice(0,10) : 'null', '| rows:', count));

  if (r4.data?.length) {
    console.log('\n[5] Sample future symbols:');
    r4.data.slice(0,10).forEach(r => console.log(' ', r.p_trd_symbol));
  }
}

main().catch(console.error);
