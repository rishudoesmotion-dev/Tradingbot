# 🧪 Dummy Trading Rules Test Server

A comprehensive testing server to validate all trading rules and risk management logic **while the market is closed**.

## 📋 Overview

This test server simulates real trading scenarios and validates:

- ✅ **Rule 0**: Allowed Instruments Only (NIFTY, BANKNIFTY)
- ✅ **Rule 1**: Prevent Concurrent Trades (1 open trade at a time)
- ✅ **Rule 2**: NIFTY Lot Limit (1 lot per day)
- ✅ **Rule 3**: Daily Trade Limit (3 trades per day)
- ✅ **General Risk Checks**:
  - Position size limit (₹100,000)
  - Max lots validation (10 lots)
  - Loss limit enforcement (₹5,000)
  - Kill switch status

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Run All Tests

```bash
npm run test:rules
```

### Watch Mode (Auto-rerun on changes)

```bash
npm run test:rules:watch
```

## 📊 Test Suites

### Test Suite 1: Rule 0 - Allowed Instruments
**Purpose**: Ensure only configured instruments can be traded

**Tests**:
- ✅ NIFTY options allowed
- ✅ BANKNIFTY options allowed
- ❌ Stocks/other instruments blocked

**Config**: `allowedInstruments: ['NIFTY', 'BANKNIFTY']`

---

### Test Suite 2: Rule 1 - No Concurrent Trades
**Purpose**: Prevent multiple open positions simultaneously

**Tests**:
- ✅ First trade allowed
- ❌ Second trade blocked if first is still open
- ✅ New trade allowed after closing previous position

**Config**: `preventConcurrentTrades: true`

---

### Test Suite 3: Rule 2 - NIFTY Lot Limit
**Purpose**: Limit NIFTY trading to 1 lot per calendar day

**Tests**:
- ✅ First NIFTY trade (1 lot) allowed
- ❌ Second NIFTY trade same day blocked
- ✅ BANKNIFTY trade allowed (not limited)

**Config**: `niftyMaxLots: 1`

---

### Test Suite 4: Rule 3 - Daily Trade Limit
**Purpose**: Limit total trades per calendar day

**Tests**:
- ✅ Trades 1-3 allowed (within limit)
- ❌ Trade 4 blocked (exceeds limit)

**Config**: `maxTradesPerDay: 3`

---

### Test Suite 5: General Risk Checks
**Purpose**: Validate position sizing and capital limits

**Tests**:
- ✅ Position size under ₹100,000 limit
- ❌ Position size over ₹100,000 blocked
- ✅ Quantity under 10 lots allowed
- ❌ Quantity over 10 lots blocked

**Config**:
```typescript
maxPositionSize: 100000    // ₹100,000
maxLots: 10               // Maximum quantity
maxLossLimit: 5000        // ₹5,000 daily loss limit
```

## 📈 Sample Output

```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  🧪 DUMMY TRADING RULES TEST SERVER                           ║
║  Market Closed Testing - All Rules Validation                 ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

📋 TEST SUITE: Rule 0 - Allowed Instruments Only
──────────────────────────────────────────────────────────────────
✅ PASS: Valid NIFTY order
   📝 Should accept NIFTY options
   
✅ PASS: Valid BANKNIFTY order
   📝 Should accept BANKNIFTY options
   
❌ FAIL: Invalid instrument (STOCK)
   📝 Expected: INVALID
   📝 Got: VALID

... (more tests)

════════════════════════════════════════════════════════════════════
📊 TEST EXECUTION REPORT
════════════════════════════════════════════════════════════════════

Total Tests: 23
✅ Passed:   21
❌ Failed:   2
📊 Success:  91.3%

⚠️  Some tests failed

Failed Tests:
  ❌ Invalid instrument: Expected invalid got valid
  ❌ Concurrent trade blocked: Expected invalid got valid
```

## 🔧 Configuration

### Environment Variables

The test server reads from `.env`:

```properties
# Risk Management Configuration
MAX_TRADES_PER_DAY=3
MAX_LOSS_LIMIT=5000
MAX_LOTS=10

# Trading Rules Configuration
NIFTY_MAX_LOTS=1
PREVENT_CONCURRENT_TRADES=true
ALLOWED_INSTRUMENTS=NIFTY
```

### Hardcoded Config (in test server)

```typescript
{
  maxTradesPerDay: 3,
  maxLossLimit: 5000,
  maxLots: 10,
  maxPositionSize: 100000,
  stopLossPercentage: 2,
  targetProfitPercentage: 5,
  enableKillSwitch: true,
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│         DummyTradingServer (Test Runner)                │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   ┌─────────────┐        ┌──────────────┐
   │ RiskManager │        │TradesRules   │
   │             │        │Engine        │
   │ - validateOrd│        │              │
   │ - getDayStats│        │ - validate   │
   │ - logTrade   │        │ - checkRules │
   └─────────────┘        └──────────────┘
        │                         │
        └────────────┬────────────┘
                     │
        ┌────────────▼────────────┐
        │  Supabase (mocked)       │
        │  - Read trade history    │
        │  - Check positions       │
        │  - Validate rules        │
        └──────────────────────────┘
```

## 🧩 Test Scenario Examples

### Scenario 1: Multi-Rule Validation
```typescript
// First trade of the day - NIFTY
const trade1 = {
  symbol: 'NIFTY-CE-25-3800',
  exchange: 'NFO',
  side: OrderSide.BUY,
  quantity: 1,
  orderType: OrderType.LIMIT,
  productType: ProductType.INTRADAY,
  price: 45.50,
};

// ✅ Passes all rules:
// - Rule 0: NIFTY is allowed
// - Rule 1: No open trades
// - Rule 2: First NIFTY trade of day
// - Rule 3: First trade of day (1/3)
```

### Scenario 2: NIFTY Limit Violation
```typescript
// After first NIFTY trade closes...
const trade2 = {
  symbol: 'NIFTY-PE-25-3700', // Different strike
  exchange: 'NFO',
  side: OrderSide.BUY,
  quantity: 1,
  orderType: OrderType.LIMIT,
  productType: ProductType.INTRADAY,
  price: 52.25,
};

// ❌ Blocked by Rule 2:
// "NIFTY lot limit exceeded (1 lot already traded today)"
```

### Scenario 3: Concurrent Trade Violation
```typescript
// With existing open position...
const trade2 = {
  symbol: 'BANKNIFTY-CE-25-53000', // Different symbol
  exchange: 'NFO',
  side: OrderSide.BUY,
  quantity: 1,
  orderType: OrderType.LIMIT,
  productType: ProductType.INTRADAY,
  price: 125.75,
};

// ❌ Blocked by Rule 1:
// "Cannot open new trade while another is active"
```

## 🐛 Debugging

### Enable Verbose Logging

Edit `dummy-trading-server.ts` and uncomment debug lines:

```typescript
private async testOrderValidation(...) {
  // Uncomment for detailed logs:
  console.log('[DEBUG] Order:', orderRequest);
  console.log('[DEBUG] Result:', result);
}
```

### Check Individual Rules

Run specific test suite:

```typescript
// In dummy-trading-server.ts runAllTests():
await this.testRule2NiftyLotLimit(); // Only NIFTY limit tests
```

## 📝 Adding New Tests

### Example: Test Custom Rule

```typescript
async testCustomRule(): Promise<void> {
  console.log('\n🔍 TEST SUITE: Custom Rule');
  console.log('─'.repeat(70));

  await this.testOrderValidation(
    'Test case name',
    {
      symbol: 'NIFTY-CE-25-3800',
      exchange: 'NFO',
      side: OrderSide.BUY,
      quantity: 1,
      orderType: OrderType.LIMIT,
      productType: ProductType.INTRADAY,
      price: 45.50,
    },
    true, // should pass
    'Description of what should happen'
  );
}

// Then call in runAllTests():
await this.testCustomRule();
```

## 🎯 Next Steps

After validating all rules with this test server:

1. ✅ **Complete**: Test server validates all rules
2. ⏳ **TODO**: Integrate with live market data
3. ⏳ **TODO**: Test with real Kotak Neo API
4. ⏳ **TODO**: Performance testing with high-frequency trades
5. ⏳ **TODO**: Stress testing with edge cases

## 📚 Related Files

- **Rules Engine**: `src/lib/rules/TradesRulesEngine.ts`
- **Risk Manager**: `src/lib/risk/RiskManager.ts`
- **Type Definitions**: `src/types/broker.types.ts`
- **Environment Config**: `.env`
- **Documentation**: `TRADING_RULES_ENGINE.md`

## 💡 Tips

- **Run before market open**: Validate all rules are working
- **Run after code changes**: Ensure rules still pass
- **Run before production**: Confidence test before live trading
- **Keep test data clean**: Reset between test suites

## ❓ FAQ

**Q: Why use dummy server instead of real market?**
A: Market is closed and dummy server is deterministic - same results every time

**Q: Can I modify test cases?**
A: Yes! Edit `dummy-trading-server.ts` and add your scenarios

**Q: What if tests fail?**
A: Check error messages, review the rule implementation, and update

**Q: How to skip certain tests?**
A: Comment out the `await this.test*()` line in `runAllTests()`

---

**Created**: March 3, 2026  
**Status**: ✅ Ready for Testing  
**Last Updated**: Today
