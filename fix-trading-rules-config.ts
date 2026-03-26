/**
 * Fix Trading Rules Config
 * Updates Supabase to only allow NIFTY (not BANKNIFTY)
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { supabase } from '@/lib/supabase/client';

async function fixConfig() {
  try {
    console.log('🔧 Fixing trading rules config...\n');

    // Update trading_rules_config to only allow NIFTY
    console.log('1️⃣  Updating trading_rules_config...');
    const { data: configData, error: configError } = await supabase
      .from('trading_rules_config')
      .update({ allowed_instruments: ['NIFTY'] })
      .eq('id', (await supabase.from('trading_rules_config').select('id').limit(1)).data?.[0]?.id)
      .select();

    if (configError) {
      console.error('❌ Error updating config:', configError);
    } else {
      console.log('✅ Config updated:', configData);
    }

    // Disable BANKNIFTY in allowed_instruments table
    console.log('\n2️⃣  Disabling BANKNIFTY instruments...');
    const { data: instrumentsData, error: instrumentsError } = await supabase
      .from('allowed_instruments')
      .update({ is_enabled: false })
      .in('symbol', ['BANKNIFTY', 'BANKNIFTY-CE', 'BANKNIFTY-PE'])
      .select();

    if (instrumentsError) {
      console.error('❌ Error updating instruments:', instrumentsError);
    } else {
      console.log('✅ Instruments updated:', instrumentsData?.map(i => `${i.symbol} (enabled: ${i.is_enabled})`));
    }

    console.log('\n✨ Fix complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixConfig().then(() => process.exit(0));
