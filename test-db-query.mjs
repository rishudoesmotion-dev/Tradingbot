import dotenv from 'dotenv';
dotenv.config({path:'.env'});
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const nowTs = Math.floor(Date.now()/1000);
const resolvedTs = 1775550600; // April 7 expiry

const { data: rows, error } = await s.from('scrip_master')
  .select('p_trd_symbol, p_tok')
  .eq('p_symbol','NIFTY')
  .eq('segment','nse_fo')
  .eq('l_expiry_date', resolvedTs)
  .limit(10);

console.log('err:', error?.message);
if (rows?.length) {
  rows.forEach(r => console.log(' trd_symbol:', r.p_trd_symbol, 'tok:', r.p_tok));
}
