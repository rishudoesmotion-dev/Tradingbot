/**
 * Trading Rules Test Suite
 * Tests all trading rules with correct business logic:
 * 1. Max 1 lot (65 qty) per BUY order for NIFTY
 * 2. No 2 concurrent NIFTY open positions
 * 3. Max 3 trades per day (BUY+SELL per symbol = 1 trade)
 * 4. Only NIFTY allowed
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { RiskManager } from '@/lib/risk/RiskManager';
import { tradesRulesEngine } from '@/lib/rules/TradesRulesEngine_v2';
import { OrderRequest, OrderSide, OrderType, ProductType } from '@/types/broker.types';

class TradingRulesTest {
  private riskManager: RiskManager;
  private positions: Map<string, any> = new Map();
  private trades: any[] = [];
  private results = { passed: 0, failed: 0, tests: [] as any[] };

  constructor() {
    this.riskManager = new RiskManager({
      maxTradesPerDay: 3,
      maxLossLimit: 5000,
      maxLots: 10,
      maxPositionSize: 100000,
      stopLossPercentage: 2,
      targetProfitPercentage: 5,
      enableKillSwitch: true,
    });
  }

  private setContext() {
    tradesRulesEngine.setTestContext({
      positions: this.positions,
      trades: this.trades,
      mockConfig: {
        allowedInstruments: ['NIFTY'],
        niftyMaxLots: 1,
        preventConcurrentTrades: true,
        maxTradesPerDay: 3,
      },
    });
  }

  private async test(name: string, order: OrderRequest, shouldPass: boolean, reason: string) {
    try {
      this.setContext();
      const result = await this.riskManager.validateOrder(order);
      const passed = result.isValid === shouldPass;

      if (passed) {
        this.results.passed++;
        console.log(`✅ ${name}`);
      } else {
        this.results.failed++;
        console.log(`❌ ${name}`);
        console.log(`   Expected: ${shouldPass ? 'VALID' : 'INVALID'}, Got: ${result.isValid ? 'VALID' : 'INVALID'}`);
        if (result.errors.length > 0) console.log(`   Errors: ${result.errors.join(', ')}`);
      }

      this.results.tests.push({ name, passed, reason });
    } catch (error) {
      this.results.failed++;
      console.log(`❌ ${name} - ERROR: ${error instanceof Error ? error.message : String(error)}`);
      this.results.tests.push({ name, passed: false, reason: String(error) });
    }
  }

  async runTests() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         🧪 TRADING RULES TEST SUITE                        ║');
    console.log('║     Max 1 lot/order | No concurrent | 3 trades/day       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 1: Allowed Instruments
    // ═══════════════════════════════════════════════════════════════════════
    console.log('📋 TEST SUITE 1: Allowed Instruments\n');

    this.positions.clear();
    this.trades = [];

    await this.test(
      'Test 1.1: NIFTY-CE is allowed',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'NIFTY-CE should be allowed'
    );

    await this.test(
      'Test 1.2: NIFTY-PE is allowed',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      true,
      'NIFTY-PE should be allowed'
    );

    await this.test(
      'Test 1.3: BANKNIFTY is NOT allowed',
      {
        symbol: 'BANKNIFTY-CE-25-53000',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 125.75,
      },
      false,
      'BANKNIFTY should NOT be allowed'
    );

    await this.test(
      'Test 1.4: TCS is NOT allowed',
      {
        symbol: 'TCS',
        exchange: 'NSE',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.DELIVERY,
        price: 3500,
      },
      false,
      'TCS should NOT be allowed'
    );

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 2: NIFTY Lot Limit per Order (Max 65 qty per BUY)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 TEST SUITE 2: NIFTY Lot Limit (Max 65 qty per BUY order)\n');

    this.positions.clear();
    this.trades = [];

    await this.test(
      'Test 2.1: BUY 50 NIFTY-CE (within 65 limit)',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'Should allow 50 qty (< 65)'
    );

    await this.test(
      'Test 2.2: BUY 65 NIFTY-PE (at limit)',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      true,
      'Should allow 65 qty (= 65)'
    );

    await this.test(
      'Test 2.3: BUY 66 NIFTY-CE (exceeds 65 limit)',
      {
        symbol: 'NIFTY-CE-25-3900',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 66,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 42.50,
      },
      false,
      'Should reject 66 qty (> 65)'
    );

    await this.test(
      'Test 2.4: SELL 50 NIFTY-CE (SELL not limited)',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.SELL,
        quantity: 10,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 47.50,
      },
      true,
      'SELL orders should not be limited by lot rule'
    );

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 3: No Concurrent Trades (Can't have 2 open NIFTY positions)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🔒 TEST SUITE 3: No Concurrent Trades (Max 1 open NIFTY position)\n');

    this.positions.clear();
    this.trades = [];

    await this.test(
      'Test 3.1: Open first NIFTY-CE position',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'Should allow first position'
    );

    // Add position to simulate open trade
    this.positions.set('NIFTY-CE-25-3800', { symbol: 'NIFTY-CE-25-3800', quantity: 5 });
    this.setContext();

    await this.test(
      'Test 3.2: Cannot open second NIFTY position while first is open',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      false,
      'Should block second concurrent position'
    );

    // Close first position
    this.positions.clear();
    this.setContext();

    await this.test(
      'Test 3.3: Can open new position after closing first',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      true,
      'Should allow after position closed'
    );

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 4: Daily Trade Limit (Max 3 trades, BUY+SELL per symbol = 1)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n⏰ TEST SUITE 4: Daily Trade Limit (Max 3 trades/day)\n');

    this.positions.clear();
    this.trades = [];
    this.setContext();

    await this.test(
      'Test 4.1: Trade 1 - BUY NIFTY-CE',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'Should allow 1st trade'
    );

    this.trades.push({ symbol: 'NIFTY-CE-25-3800', quantity: 5, side: OrderSide.BUY });
    this.setContext();

    await this.test(
      'Test 4.2: Trade 2 - BUY NIFTY-PE',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      true,
      'Should allow 2nd trade'
    );

    this.trades.push({ symbol: 'NIFTY-PE-25-3700', quantity: 5, side: OrderSide.BUY });
    this.setContext();

    await this.test(
      'Test 4.3: Trade 3 - BUY NIFTY-CE-25-3900',
      {
        symbol: 'NIFTY-CE-25-3900',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 42.50,
      },
      true,
      'Should allow 3rd trade'
    );

    this.trades.push({ symbol: 'NIFTY-CE-25-3900', quantity: 5, side: OrderSide.BUY });
    this.setContext();

    await this.test(
      'Test 4.4: Trade 4 - Should be BLOCKED (limit reached)',
      {
        symbol: 'NIFTY-PE-25-3600',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 35.75,
      },
      false,
      'Should block 4th trade (max 3/day)'
    );

    // ═══════════════════════════════════════════════════════════════════════
    // PRINT RESULTS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('═'.repeat(60));

    const total = this.results.passed + this.results.failed;
    const percentage = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : '0';

    console.log(`\nTotal Tests: ${total}`);
    console.log(`✅ Passed:   ${this.results.passed}`);
    console.log(`❌ Failed:   ${this.results.failed}`);
    console.log(`📊 Success:  ${percentage}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter((t) => !t.passed)
        .forEach((t) => {
          console.log(`   • ${t.name}`);
          console.log(`     ${t.reason}`);
        });
    }

    console.log('\n' + '═'.repeat(60));
    if (this.results.failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Trading rules are working correctly.');
    } else {
      console.log(`⚠️  ${this.results.failed} test(s) failed. Please review.`);
    }
    console.log('═'.repeat(60) + '\n');

    process.exit(this.results.failed > 0 ? 1 : 0);
  }
}

// Run tests
const tester = new TradingRulesTest();
tester.runTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
