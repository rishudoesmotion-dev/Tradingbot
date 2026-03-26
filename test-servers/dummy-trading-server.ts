/**
 * Dummy Trading Rules Testing Server
 * 
 * Purpose: Test all trading rules and risk management logic
 * while the market is closed
 * 
 * Simulates:
 * 1. Market data streaming (fake prices)
 * 2. Order placement and validation
 * 3. All trading rules enforcement
 * 4. Risk management checks
 * 5. Position tracking
 * 6. P&L calculation
 * 
 * Run: npx ts-node test-servers/dummy-trading-server.ts
 * Or:  npm run test:rules
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { RiskManager } from '@/lib/risk/RiskManager';
import { tradesRulesEngine } from '@/lib/rules/TradesRulesEngine_v2';
import { OrderRequest, OrderSide, OrderType, ProductType } from '@/types/broker.types';

// ════════════════════════════════════════════════════════════════════════════
// MOCK DATA & STATE MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

interface MockPosition {
  symbol: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  pnl: number;
}

interface MockTrade {
  id: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  pnl: number;
  timestamp: Date;
}

class DummyTradingServer {
  private riskManager: RiskManager;
  private tradesRulesEngine = tradesRulesEngine; // Singleton instance
  private positions: Map<string, MockPosition> = new Map();
  private trades: MockTrade[] = [];
  private prices: Map<string, number> = new Map();
  private testResults: {
    passed: number;
    failed: number;
    tests: Array<{ name: string; passed: boolean; error?: string }>;
  } = { passed: 0, failed: 0, tests: [] };

  constructor() {
    // Initialize with default config from .env
    this.riskManager = new RiskManager({
      maxTradesPerDay: 3,
      maxLossLimit: 5000,
      maxLots: 10,
      maxPositionSize: 100000,
      stopLossPercentage: 2,
      targetProfitPercentage: 5,
      enableKillSwitch: true,
    });

    // tradesRulesEngine is already initialized as a singleton, no need to instantiate

    this.initializePrices();
  }

  // ════════════════════════════════════════════════════════════════════════
  // SETUP & INITIALIZATION
  // ════════════════════════════════════════════════════════════════════════

  private initializePrices(): void {
    // Initialize realistic option prices (NIFTY only - BANKNIFTY not allowed)
    this.prices.set('NIFTY-CE-25-3800', 45.50);
    this.prices.set('NIFTY-PE-25-3700', 52.25);
    this.prices.set('NIFTY-PE-25-3600', 35.75);
    this.prices.set('NIFTY', 23800);
  }

  /**
   * Set test context for TradesRulesEngine
   * This allows the engine to use in-memory data instead of querying Supabase
   */
  private setEngineTestContext(): void {
    this.tradesRulesEngine.setTestContext({
      positions: this.positions,
      trades: this.trades,
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // TEST SUITE: RULE 0 - ALLOWED INSTRUMENTS
  // ════════════════════════════════════════════════════════════════════════

  async testRule0AllowedInstruments(): Promise<void> {
    console.log('\n📋 TEST SUITE: Rule 0 - Allowed Instruments Only');
    console.log('─'.repeat(70));

    this.setEngineTestContext();

    // ✅ Test 1: Valid instrument (NIFTY)
    await this.testOrderValidation(
      'Valid NIFTY order',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'Should accept NIFTY options'
    );

    // ❌ Test 2: Invalid instrument (BANKNIFTY)
    await this.testOrderValidation(
      'Invalid BANKNIFTY order',
      {
        symbol: 'BANKNIFTY-CE-25-53000',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 125.75,
      },
      false,
      'Should reject BANKNIFTY (not allowed)'
    );

    // ❌ Test 3: Invalid instrument (STOCK)
    await this.testOrderValidation(
      'Invalid instrument (STOCK)',
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
      'Should reject non-allowed instruments'
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // TEST SUITE: RULE 1 - PREVENT CONCURRENT TRADES
  // ════════════════════════════════════════════════════════════════════════

  async testRule1NoConcurrentTrades(): Promise<void> {
    console.log('\n🔒 TEST SUITE: Rule 1 - No Concurrent Trades');
    console.log('─'.repeat(70));

    // Setup: Clear positions
    this.positions.clear();
    this.trades = [];
    this.setEngineTestContext();

    // ✅ Test 1: First trade should be allowed
    await this.testOrderValidation(
      'First trade allowed',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'First trade should be allowed'
    );

    // Add a position to simulate open trade
    this.positions.set('NIFTY-CE-25-3800', {
      symbol: 'NIFTY-CE-25-3800',
      quantity: 1,
      buyPrice: 45.50,
      currentPrice: 47.25,
      pnl: 1.75,
    });

    // ❌ Test 2: Second concurrent trade should be blocked
    await this.testOrderValidation(
      'Concurrent trade blocked',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      false,
      'Should prevent concurrent open trades'
    );

    // Clear positions for next test
    this.positions.clear();
  }

  // ════════════════════════════════════════════════════════════════════════
  // TEST SUITE: RULE 2 - NIFTY LOT LIMIT (1 lot per day)
  // ════════════════════════════════════════════════════════════════════════

  async testRule2NiftyLotLimit(): Promise<void> {
    console.log('\n📊 TEST SUITE: Rule 2 - NIFTY Lot Limit (1 lot/day)');
    console.log('─'.repeat(70));

    // Setup: Clear state
    this.positions.clear();
    this.trades = [];
    this.setEngineTestContext();

    // ✅ Test 1: First NIFTY trade (1 lot) should be allowed
    await this.testOrderValidation(
      'NIFTY 1-lot order allowed',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'First 1-lot NIFTY trade should be allowed'
    );

    // Add trade to history (close it)
    this.trades.push({
      id: `trade_${this.trades.length + 1}`,
      symbol: 'NIFTY-CE-25-3800',
      side: OrderSide.BUY,
      quantity: 1,
      price: 45.50,
      pnl: 0,
      timestamp: new Date(),
    });

    // ❌ Test 2: Second NIFTY trade same day should be blocked
    await this.testOrderValidation(
      'NIFTY 2nd lot same day blocked',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      false,
      'Should limit NIFTY to 1 lot per day'
    );

    // ✅ Test 3: Different NIFTY option should also count toward limit
    await this.testOrderValidation(
      'NIFTY PE also blocked (1 lot limit)',
      {
        symbol: 'NIFTY-PE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 40.25,
      },
      false,
      'Any NIFTY trade counts toward the 1 lot limit'
    );

    // Clear for next tests
    this.trades = [];
  }

  // ════════════════════════════════════════════════════════════════════════
  // TEST SUITE: RULE 3 - DAILY TRADE LIMIT (3 trades/day)
  // ════════════════════════════════════════════════════════════════════════
  // NOTE: Since NIFTY is limited to 1 trade per day, we can only test 1 trade here
  // The daily trade limit would require multiple different instruments to test fully

  async testRule3DailyTradeLimit(): Promise<void> {
    console.log('\n⏰ TEST SUITE: Rule 3 - Daily Trade Limit (3 trades/day)');
    console.log('─'.repeat(70));
    console.log('Note: Limited by NIFTY 1-trade-per-day rule. Testing 1 trade here.');
    console.log('');

    // Setup: Clear state
    this.positions.clear();
    this.trades = [];
    this.setEngineTestContext();

    // ✅ Test 1: First NIFTY trade allowed (respects both rules)
    await this.testOrderValidation(
      'Trade 1/3 allowed',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'Trade 1 within daily limit'
    );

    // Add to trade history
    this.trades.push({
      id: 'trade_1',
      symbol: 'NIFTY-CE-25-3800',
      side: OrderSide.BUY,
      quantity: 1,
      price: 45.50,
      pnl: 0,
      timestamp: new Date(),
    });

    // ❌ Test 2: Second trade attempts are blocked by NIFTY lot limit
    await this.testOrderValidation(
      'Trade 2 blocked (NIFTY limit)',
      {
        symbol: 'NIFTY-CE-25-3900',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 42.50,
      },
      false,
      'Trade 2 blocked because NIFTY already traded today'
    );

    // ❌ Test 3: Any additional trade also blocked
    await this.testOrderValidation(
      'Trade 3 blocked (NIFTY limit)',
      {
        symbol: 'NIFTY-PE-25-3700',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 1,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 52.25,
      },
      false,
      'Trade 3 blocked because NIFTY already traded today'
    );

  // ════════════════════════════════════════════════════════════════════════
  // TEST SUITE: GENERAL RISK CHECKS
  // ════════════════════════════════════════════════════════════════════════

  async testGeneralRiskChecks(): Promise<void> {
    console.log('\n⚠️  TEST SUITE: General Risk Management Checks');
    console.log('─'.repeat(70));

    // Setup: Clear state
    this.positions.clear();
    this.trades = [];
    this.setEngineTestContext();

    // ✅ Test 1: Order within position size limit
    await this.testOrderValidation(
      'Position size within limit',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 5, // 5 * 45.50 = 227.5 (within 100k limit)
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      true,
      'Position size under 100k limit'
    );

    // ❌ Test 2: Order exceeds position size limit
    await this.testOrderValidation(
      'Position size exceeds limit',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 3000, // 3000 * 45.50 = 136,500 (exceeds 100k limit)
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      false,
      'Position size should be limited'
    );

    // ✅ Test 3: Order quantity within max lots
    await this.testOrderValidation(
      'Lot quantity within limit',
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
      'Quantity (5) within max lots (10)'
    );

    // ❌ Test 4: Order quantity exceeds max lots
    await this.testOrderValidation(
      'Lot quantity exceeds limit',
      {
        symbol: 'NIFTY-CE-25-3800',
        exchange: 'NFO',
        side: OrderSide.BUY,
        quantity: 15,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
        price: 45.50,
      },
      false,
      'Quantity (15) should exceed max lots (10)'
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ════════════════════════════════════════════════════════════════════════

  private async testOrderValidation(
    testName: string,
    orderRequest: OrderRequest,
    shouldPass: boolean,
    description: string
  ): Promise<void> {
    try {
      const result = await this.riskManager.validateOrder(orderRequest);
      const passed = result.isValid === shouldPass;

      if (passed) {
        this.testResults.passed++;
        console.log(`✅ PASS: ${testName}`);
        console.log(`   📝 ${description}`);
        if (result.warnings.length > 0) {
          console.log(`   ⚠️  Warnings: ${result.warnings.join(', ')}`);
        }
      } else {
        this.testResults.failed++;
        console.log(`❌ FAIL: ${testName}`);
        console.log(`   📝 Expected: ${shouldPass ? 'VALID' : 'INVALID'}`);
        console.log(`   📝 Got: ${result.isValid ? 'VALID' : 'INVALID'}`);
        if (result.errors.length > 0) {
          console.log(`   📝 Errors: ${result.errors.join(', ')}`);
        }
      }

      this.testResults.tests.push({
        name: testName,
        passed,
        error: passed ? undefined : `Expected ${shouldPass ? 'valid' : 'invalid'}, got ${result.isValid ? 'valid' : 'invalid'}`,
      });

      console.log('');
    } catch (error) {
      this.testResults.failed++;
      console.log(`❌ ERROR: ${testName}`);
      console.log(`   ${error instanceof Error ? error.message : String(error)}`);
      console.log('');
      this.testResults.tests.push({
        name: testName,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRICING SIMULATION
  // ════════════════════════════════════════════════════════════════════════

  private simulatePriceMovement(): void {
    console.log('\n📈 SIMULATING PRICE MOVEMENTS...');
    console.log('─'.repeat(70));

    this.prices.forEach((price, symbol) => {
      const change = (Math.random() - 0.5) * 10; // ±5% movement
      const newPrice = price + change;
      this.prices.set(symbol, Math.max(0.01, newPrice)); // Keep > 0

      console.log(`${symbol}: ₹${price.toFixed(2)} → ₹${newPrice.toFixed(2)} (${change > 0 ? '+' : ''}${change.toFixed(2)})`);
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // REPORT GENERATION
  // ════════════════════════════════════════════════════════════════════════

  private printTestReport(): void {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('📊 TEST EXECUTION REPORT');
    console.log('═'.repeat(70));

    const total = this.testResults.passed + this.testResults.failed;
    const percentage = total > 0 ? ((this.testResults.passed / total) * 100).toFixed(1) : '0';

    console.log(`
Total Tests: ${total}
✅ Passed:   ${this.testResults.passed}
❌ Failed:   ${this.testResults.failed}
📊 Success:  ${percentage}%

${this.testResults.failed === 0 ? '🎉 ALL TESTS PASSED!' : '⚠️  Some tests failed'}
`);

    if (this.testResults.failed > 0) {
      console.log('Failed Tests:');
      this.testResults.tests
        .filter((t) => !t.passed)
        .forEach((t) => {
          console.log(`  ❌ ${t.name}: ${t.error}`);
        });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // MAIN TEST RUNNER
  // ════════════════════════════════════════════════════════════════════════

  async runAllTests(): Promise<void> {
    console.log('\n');
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('║' + '  🧪 DUMMY TRADING RULES TEST SERVER'.padEnd(68) + '║');
    console.log('║' + '  Market Closed Testing - All Rules Validation'.padEnd(68) + '║');
    console.log('║' + ' '.repeat(68) + '║');
    console.log('╚' + '═'.repeat(68) + '╝');

    // Run all test suites
    await this.testRule0AllowedInstruments();
    await this.testRule1NoConcurrentTrades();
    await this.testRule2NiftyLotLimit();
    await this.testRule3DailyTradeLimit();
    await this.testGeneralRiskChecks();

    // Simulate market data
    this.simulatePriceMovement();

    // Print final report
    this.printTestReport();

    console.log('\n✨ Test server completed successfully!');
  }
  testGeneralRiskChecks() {
    throw new Error('Method not implemented.');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const server = new DummyTradingServer();
  server.runAllTests().catch(console.error);
}

export default DummyTradingServer;
