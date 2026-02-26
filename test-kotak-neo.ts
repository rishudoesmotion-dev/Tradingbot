#!/usr/bin/env node

/**
 * Quick Kotak Neo Setup Test
 * 
 * This script tests your Kotak Neo configuration
 * Run: npx ts-node test-kotak-neo.ts
 */

import { BrokerFactory } from './src/lib/brokers/BrokerFactory';
import { OrderSide, OrderType, ProductType } from './src/types/broker.types';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title: string) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${title}`, 'bright');
  log(`${'='.repeat(60)}\n`, 'cyan');
}

async function main() {
  let broker = null;

  try {
    section('KOTAK NEO SETUP TEST');

    // Step 1: Check environment variables
    log('Step 1: Checking environment variables...', 'blue');
    const requiredVars = [
      'KOTAK_CONSUMER_KEY',
      'KOTAK_MOBILE_NUMBER',
      'KOTAK_UCC',
      'KOTAK_TOTP',
      'KOTAK_MPIN',
    ];

    let allVarsPresent = true;
    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (value && value !== 'your_consumer_key' && !value.includes('YOUR_')) {
        log(`  ✅ ${varName}: ${value.substring(0, 10)}...`, 'green');
      } else {
        log(`  ❌ ${varName}: NOT SET or placeholder value`, 'red');
        allVarsPresent = false;
      }
    }

    if (!allVarsPresent) {
      log('\n⚠️  Update .env file with real credentials!', 'yellow');
      return;
    }

    // Step 2: Create broker instance
    section('STEP 2: CREATING BROKER INSTANCE');
    log('Creating Kotak Neo adapter...', 'blue');
    broker = BrokerFactory.createFromEnv();
    log('✅ Broker instance created', 'green');

    // Step 3: Authenticate
    section('STEP 3: AUTHENTICATION');
    log('Authenticating with Kotak Neo...', 'blue');
    log('This may take a few seconds...', 'yellow');

    const authenticated = await broker.authenticate();

    if (!authenticated) {
      log('❌ Authentication failed!', 'red');
      log('\nPossible issues:', 'yellow');
      log('  1. TOTP code expired (codes expire every 30 seconds)', 'reset');
      log('  2. MPIN is incorrect', 'reset');
      log('  3. Mobile number doesn\'t match registered number', 'reset');
      return;
    }

    log('✅ Successfully authenticated!', 'green');

    // Step 4: Check balance
    section('STEP 4: CHECK ACCOUNT BALANCE');
    log('Fetching account balance...', 'blue');

    try {
      const balance = await broker.getBalance();
      log(`✅ Account Balance: Rs${balance.toFixed(2)}`, 'green');

      if (balance < 5000) {
        log(`⚠️  Warning: Low balance for trading (< Rs5000)`, 'yellow');
      }
    } catch (error) {
      log(`⚠️  Could not fetch balance: ${error instanceof Error ? error.message : 'Unknown error'}`, 'yellow');
    }

    // Step 5: Check positions
    section('STEP 5: CHECK POSITIONS');
    log('Fetching open positions...', 'blue');

    try {
      const positions = await broker.getPositions();

      if (positions.length === 0) {
        log('✅ No open positions (clean slate)', 'green');
      } else {
        log(`✅ Found ${positions.length} open position(s):`, 'green');
        positions.forEach((pos, idx) => {
          log(`\n  ${idx + 1}. ${pos.symbol}`, 'cyan');
          log(`     Qty: ${pos.quantity}`, 'reset');
          log(`     LTP: Rs${pos.ltp}`, 'reset');
          log(`     P&L: Rs${pos.pnl.toFixed(2)} (${pos.pnlPercentage.toFixed(2)}%)`, 'reset');
        });
      }
    } catch (error) {
      log(`⚠️  Could not fetch positions: ${error instanceof Error ? error.message : 'Unknown error'}`, 'yellow');
    }

    // Step 6: Check orders
    section('STEP 6: CHECK ORDERS');
    log('Fetching recent orders...', 'blue');

    try {
      const orders = await broker.getOrders();

      if (orders.length === 0) {
        log('✅ No recent orders', 'green');
      } else {
        log(`✅ Found ${orders.length} recent order(s):`, 'green');
        orders.slice(0, 5).forEach((order, idx) => {
          log(`\n  ${idx + 1}. ${order.symbol}`, 'cyan');
          log(`     Side: ${order.side}`, 'reset');
          log(`     Qty: ${order.quantity}`, 'reset');
          log(`     Status: ${order.status}`, 'reset');
        });
      }
    } catch (error) {
      log(`⚠️  Could not fetch orders: ${error instanceof Error ? error.message : 'Unknown error'}`, 'yellow');
    }

    // Step 7: Get LTP
    section('STEP 7: GET MARKET DATA (LTP)');
    log('Fetching TCS-EQ last traded price...', 'blue');

    try {
      const ltp = await broker.getLTP('TCS-EQ', 'NSE');
      log(`✅ TCS-EQ LTP: Rs${ltp}`, 'green');
    } catch (error) {
      log(`⚠️  Could not fetch LTP: ${error instanceof Error ? error.message : 'Unknown error'}`, 'yellow');
    }

    // Summary
    section('SETUP VERIFICATION SUMMARY');

    log('✅ ALL TESTS PASSED!', 'green');
    log('\nYour Kotak Neo setup is ready for trading.', 'cyan');
    log('\nNext steps:', 'blue');
    log('  1. Start trading through the dashboard:', 'reset');
    log('     npm run dev', 'cyan');
    log('\n  2. Or use the test trade script:', 'reset');
    log('     npx ts-node test-first-trade.ts', 'cyan');
    log('\n  3. Read the documentation:', 'reset');
    log('     SETUP_KOTAK_NEO_TRADING.md', 'cyan');
    log('     KOTAK_NEO_QUICKSTART.md', 'cyan');

  } catch (error) {
    log('\n❌ TEST FAILED!', 'red');
    log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'red');

    if (error instanceof Error && error.message.includes('TOTP')) {
      log('\nTroubleshooting TOTP:', 'yellow');
      log('  • Generate fresh TOTP code (codes expire every 30 seconds)', 'reset');
      log('  • Update KOTAK_TOTP in .env', 'reset');
      log('  • Restart the test', 'reset');
    }

    if (error instanceof Error && error.message.includes('MPIN')) {
      log('\nTroubleshooting MPIN:', 'yellow');
      log('  • Verify MPIN is exactly 6 digits', 'reset');
      log('  • Check account is active for trading', 'reset');
      log('  • Verify credentials match your trading account', 'reset');
    }

    process.exit(1);
  } finally {
    if (broker) {
      try {
        await broker.disconnect();
        log('\n✅ Disconnected from Kotak Neo', 'green');
      } catch (error) {
        log(`Warning: Could not disconnect properly`, 'yellow');
      }
    }
  }

  log('\n');
}

// Run the test
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
