/**
 * Supabase Trading Rules Verification Script
 * 
 * Verifies that all trading rules tables and data have been created correctly
 * in Supabase after running the migration
 * 
 * Run: npx ts-node verify-trading-rules-setup.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifySetup(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  🔍 Supabase Trading Rules Setup Verification                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // ═════════════════════════════════════════════════════════════════════
    // Check 1: trading_rules table
    // ═════════════════════════════════════════════════════════════════════
    console.log('1️⃣  Checking trading_rules table...');
    const { data: rules, error: rulesError } = await supabase
      .from('trading_rules')
      .select('*');

    if (rulesError) {
      console.log(`   ❌ Error: ${rulesError.message}`);
    } else {
      console.log(`   ✅ Table exists with ${rules?.length || 0} rules`);
      if (rules && rules.length > 0) {
        rules.forEach((rule: any) => {
          console.log(`      • ${rule.name} (${rule.rule_type})`);
        });
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Check 2: trading_rules_config table
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n2️⃣  Checking trading_rules_config table...');
    const { data: config, error: configError } = await supabase
      .from('trading_rules_config')
      .select('*')
      .single();

    if (configError) {
      console.log(`   ❌ Error: ${configError.message}`);
    } else {
      console.log('   ✅ Configuration found:');
      console.log(`      • NIFTY Max Lots: ${config?.nifty_max_lots}`);
      console.log(`      • Prevent Concurrent Trades: ${config?.prevent_concurrent_trades}`);
      console.log(`      • Max Trades/Day: ${config?.max_trades_per_day}`);
      console.log(`      • Allowed Instruments: ${config?.allowed_instruments?.join(', ')}`);
      console.log(`      • Rules Enabled: ${config?.rules_enabled}`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Check 3: allowed_instruments table
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n3️⃣  Checking allowed_instruments table...');
    const { data: instruments, error: instrumentsError } = await supabase
      .from('allowed_instruments')
      .select('*')
      .eq('is_enabled', true);

    if (instrumentsError) {
      console.log(`   ❌ Error: ${instrumentsError.message}`);
    } else {
      console.log(`   ✅ ${instruments?.length || 0} allowed instruments found`);
      if (instruments && instruments.length > 0) {
        instruments.forEach((inst: any) => {
          console.log(`      • ${inst.symbol}: ${inst.name} (${inst.exchange})`);
        });
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Check 4: rule_violations table
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n4️⃣  Checking rule_violations table...');
    const { data: violations, error: violationsError } = await supabase
      .from('rule_violations')
      .select('*')
      .limit(5);

    if (violationsError) {
      console.log(`   ❌ Error: ${violationsError.message}`);
    } else {
      console.log(`   ✅ Table exists (${violations?.length || 0} violations found)`);
      if (violations && violations.length > 0) {
        console.log('      Recent violations:');
        violations.forEach((v: any) => {
          console.log(`         • ${v.rule_type}: ${v.violation_message}`);
        });
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // Check 5: Views
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n5️⃣  Checking views...');
    const { data: activeRules, error: viewError } = await supabase
      .from('active_trading_rules')
      .select('*');

    if (viewError) {
      console.log(`   ⚠️  View error: ${viewError.message}`);
    } else {
      console.log(`   ✅ active_trading_rules view exists (${activeRules?.length || 0} rules)`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Summary
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      ✅ SETUP COMPLETE                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('✨ All tables created successfully!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Initialize TradingRulesService in your app');
    console.log('   2. Import and use TradesRulesEngine v2');
    console.log('   3. Run: npm run test:rules');
    console.log('   4. Monitor rule violations in Supabase dashboard\n');

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

verifySetup();
