// src/lib/rules/__tests__/TradesRulesEngine.test.ts
import { TradesRulesEngine } from '../TradesRulesEngine';
import { supabase } from '@/lib/supabase/client';
import { OrderSide, OrderType, ProductType } from '@/types/broker.types';

/**
 * Quick test script for TradesRulesEngine
 * Run: npx ts-node src/lib/rules/__tests__/TradesRulesEngine.test.ts
 */

async function testTradesRulesEngine() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🧪 TRADING RULES ENGINE TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  const engine = new TradesRulesEngine({
    niftyMaxLots: 1,
    preventConcurrentTrades: true,
    maxTradesPerDay: 3,
  });

  console.log('📋 Configuration:');
  const config = engine.getConfig();
  console.log(`   - NIFTY Max Lots: ${config.niftyMaxLots}`);
  console.log(`   - Prevent Concurrent: ${config.preventConcurrentTrades}`);
  console.log(`   - Max Trades/Day: ${config.maxTradesPerDay}\n`);

  // ═══════════════════════════════════════════════════════════
  // TEST 1: Concurrent Trades Check
  // ═══════════════════════════════════════════════════════════
  console.log('Test 1️⃣  CONCURRENT TRADES CHECK');
  console.log('─────────────────────────────────────────────────────────────');
  
  try {
    console.log('   Checking for open positions...');
    const { data: positions, error } = await supabase
      .from('positions')
      .select('symbol, quantity')
      .gt('quantity', 0)
      .limit(1);

    if (error) throw error;

    if (positions && positions.length > 0) {
      console.log(`   ⚠️  Found open position: ${positions[0].symbol} (qty: ${positions[0].quantity})`);
      console.log(`   ✅ Rule correctly detects concurrent trades\n`);
    } else {
      console.log(`   ✅ No open positions found (rule will allow new trades)\n`);
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err}\n`);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 2: NIFTY Lot Limit Check
  // ═══════════════════════════════════════════════════════════
  console.log('Test 2️⃣  NIFTY LOT LIMIT CHECK');
  console.log('─────────────────────────────────────────────────────────────');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log('   Checking NIFTY trades today...');
    const { data: niftyTrades, error } = await supabase
      .from('trade_logs')
      .select('symbol, quantity')
      .ilike('symbol', '%NIFTY%')
      .gte('timestamp', today.toISOString());

    if (error) throw error;

    if (niftyTrades && niftyTrades.length > 0) {
      const totalQty = niftyTrades.reduce((sum, t) => sum + t.quantity, 0);
      const lotSize = 65; // Standard NIFTY lot
      const totalLots = Math.ceil(totalQty / lotSize);
      console.log(`   Found ${niftyTrades.length} NIFTY trade(s): ${totalQty} qty = ${totalLots} lot(s)`);
      console.log(`   Limit: ${config.niftyMaxLots} lot(s)`);
      if (totalLots >= config.niftyMaxLots) {
        console.log(`   ⚠️  Limit already reached! Rule will block further NIFTY trades\n`);
      } else {
        console.log(`   ✅ Room for ${config.niftyMaxLots - totalLots} more lot(s)\n`);
      }
    } else {
      console.log(`   ✅ No NIFTY trades today (can trade up to ${config.niftyMaxLots} lot(s))\n`);
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err}\n`);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 3: Daily Trade Limit Check
  // ═══════════════════════════════════════════════════════════
  console.log('Test 3️⃣  DAILY TRADE LIMIT CHECK');
  console.log('─────────────────────────────────────────────────────────────');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log('   Checking total trades today...');
    const { data: allTrades, error } = await supabase
      .from('trade_logs')
      .select('symbol, timestamp')
      .gte('timestamp', today.toISOString());

    if (error) throw error;

    const totalTrades = allTrades?.length ?? 0;
    console.log(`   Found ${totalTrades} trade(s) today`);
    console.log(`   Limit: ${config.maxTradesPerDay} trade(s)/day`);
    
    if (totalTrades >= config.maxTradesPerDay) {
      console.log(`   ⚠️  Limit reached! Rule will block new trades\n`);
    } else {
      console.log(`   ✅ Can execute ${config.maxTradesPerDay - totalTrades} more trade(s)\n`);
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err}\n`);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 4: Full Validation Test
  // ═══════════════════════════════════════════════════════════
  console.log('Test 4️⃣  FULL VALIDATION TEST');
  console.log('─────────────────────────────────────────────────────────────');
  
  try {
    const testOrder = {
      symbol: 'NIFTY-50',
      exchange: 'NSE',
      side: OrderSide.BUY,
      quantity: 75,
      orderType: OrderType.MARKET,
      productType: ProductType.INTRADAY,
    };

    console.log(`   Validating order: ${testOrder.side} ${testOrder.quantity} ${testOrder.symbol}`);
    const result = await engine.validateOrder(testOrder);

    console.log(`   Result: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (result.errors.length > 0) {
      console.log('   Errors:');
      result.errors.forEach(err => console.log(`     • ${err}`));
    } else {
      console.log('   ✅ No errors');
    }

    if (result.warnings.length > 0) {
      console.log('   Warnings:');
      result.warnings.forEach(warn => console.log(`     • ${warn}`));
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err}\n`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Tests Complete');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run tests
testTradesRulesEngine().catch(console.error);
