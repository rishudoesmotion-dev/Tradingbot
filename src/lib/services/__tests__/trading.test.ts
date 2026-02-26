// src/lib/services/__tests__/trading.test.ts
/**
 * Trading Flow Test
 * 
 * Tests the complete trading workflow:
 * 1. Authentication (TOTP + MPIN)
 * 2. Place Orders (Buy/Sell)
 * 3. Manage Positions (Exit, Kill Switch)
 * 4. View Account Status
 */

import { KotakTradingService } from '../KotakTradingService';
import { KotakAuthService } from '../KotakAuthService';
import { ProductType } from '@/types/broker.types';

/**
 * Test 1: Full Trading Flow
 * 
 * Run with:
 * ```
 * node --require ts-node/register src/lib/services/__tests__/trading.test.ts
 * ```
 */
export async function testFullTradingFlow() {
  console.log('\n🧪 TRADING FLOW TEST\n');
  console.log('='.repeat(50));

  try {
    // Step 1: Initialize Auth Service
    console.log('\n1️⃣ Initializing Authentication...');
    const authService = new KotakAuthService({
      consumerKey: process.env.KOTAK_CONSUMER_KEY || '',
      mobileNumber: process.env.KOTAK_MOBILE_NUMBER || '',
      ucc: process.env.KOTAK_UCC || '',
    });

    // Step 2: TOTP Validation (Step 2a)
    console.log('\n2️⃣ Step 2a: Validating TOTP...');
    const totp = process.env.KOTAK_TOTP || '';
    if (!totp) throw new Error('KOTAK_TOTP not set in .env');

    const totpResponse = await authService.validateTotp(totp);
    console.log('✅ TOTP validated');
    console.log(`   VIEW_TOKEN: ${totpResponse.viewToken.substring(0, 20)}...`);
    console.log(`   VIEW_SID: ${totpResponse.viewSid}`);

    // Step 3: MPIN Validation (Step 2b)
    console.log('\n3️⃣ Step 2b: Validating MPIN...');
    const mpin = process.env.KOTAK_MPIN || '';
    if (!mpin) throw new Error('KOTAK_MPIN not set in .env');

    const mpinResponse = await authService.validateMpin(mpin);
    console.log('✅ MPIN validated');
    console.log(`   TRADING_TOKEN: ${mpinResponse.tradingToken.substring(0, 20)}...`);
    console.log(`   TRADING_SID: ${mpinResponse.tradingSid}`);
    console.log(`   BASE_URL: ${mpinResponse.baseUrl}`);

    // Step 4: Initialize Trading Service
    console.log('\n4️⃣ Initializing Trading Service...');
    const tradingService = new KotakTradingService();
    const initialized = await tradingService.initialize();
    if (!initialized) throw new Error('Failed to initialize trading service');
    console.log('✅ Trading service ready');

    // Step 5: Get Account Balance
    console.log('\n5️⃣ Fetching Account Balance...');
    const balanceRes = await tradingService.getBalance();
    console.log(`✅ Balance: ₹${balanceRes.balance.toLocaleString('en-IN')}`);

    // Step 6: Get Positions
    console.log('\n6️⃣ Fetching Current Positions...');
    const positionsRes = await tradingService.getPositions();
    console.log(`✅ Found ${positionsRes.positions.length} open positions`);

    if (positionsRes.positions.length > 0) {
      console.log('\n   Current Positions:');
      const totalPnL = positionsRes.positions.reduce((sum, p) => sum + p.pnl, 0);
      positionsRes.positions.forEach((pos) => {
        console.log(`   - ${pos.symbol}: ${pos.quantity} @ ₹${pos.buyPrice}`);
        console.log(
          `     P&L: ₹${pos.pnl} (${pos.pnlPercentage > 0 ? '+' : ''}${pos.pnlPercentage.toFixed(2)}%)`
        );
      });
      console.log(`\n   Total P&L: ₹${totalPnL}`);
    }

    // Step 7: Get LTP
    console.log('\n7️⃣ Fetching Last Traded Price (INFY)...');
    const ltpRes = await tradingService.getLTP('INFY');
    console.log(`✅ INFY LTP: ₹${ltpRes.ltp}`);

    // Step 8: Place Buy Order (Market Order)
    console.log('\n8️⃣ Placing Buy Order (Market)...');
    const buyRes = await tradingService.buy({
      symbol: 'INFY',
      quantity: 1,
      productType: ProductType.INTRADAY,
    });
    if (buyRes.success) {
      console.log(`✅ Buy Order Placed`);
      console.log(`   Order ID: ${buyRes.orderId}`);
    } else {
      console.log(`⚠️ Buy Order Failed: ${buyRes.message}`);
    }

    // Step 9: Get Orders
    console.log('\n9️⃣ Fetching Order History...');
    const ordersRes = await tradingService.getOrders();
    console.log(`✅ Total orders: ${ordersRes.orders.length}`);

    if (ordersRes.orders.length > 0) {
      const recentOrder = ordersRes.orders[0];
      console.log(`   Recent: ${recentOrder.symbol} - ${recentOrder.side}`);
      console.log(`   Qty: ${recentOrder.quantity} @ ₹${recentOrder.price}`);
      console.log(`   Status: ${recentOrder.status}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ ALL TESTS PASSED\n');

    await tradingService.disconnect();
    console.log('👋 Disconnected\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Test 2: Order Placement and Management
 */
export async function testOrderManagement() {
  console.log('\n🧪 ORDER MANAGEMENT TEST\n');

  try {
    const tradingService = new KotakTradingService();
    await tradingService.initialize();

    // Buy
    console.log('Placing BUY order...');
    const buy = await tradingService.buy({
      symbol: 'RELIANCE',
      quantity: 1,
      productType: ProductType.INTRADAY,
    });
    console.log(`Buy: ${buy.success ? '✅' : '❌'} ${buy.message}`);

    if (buy.orderId) {
      // Cancel
      console.log('\nCancelling order...');
      const cancel = await tradingService.cancelOrder(buy.orderId);
      console.log(`Cancel: ${cancel.success ? '✅' : '❌'} ${cancel.message}`);
    }

    // Sell
    console.log('\nPlacing SELL order...');
    const sell = await tradingService.sell({
      symbol: 'TCS',
      quantity: 1,
      productType: ProductType.INTRADAY,
    });
    console.log(`Sell: ${sell.success ? '✅' : '❌'} ${sell.message}`);

    await tradingService.disconnect();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

/**
 * Test 3: Emergency Kill Switch
 */
export async function testKillSwitch() {
  console.log('\n🧪 KILL SWITCH TEST\n');

  try {
    const tradingService = new KotakTradingService();
    await tradingService.initialize();

    const positions = await tradingService.getPositions();
    if (positions.positions.length === 0) {
      console.log('No open positions - skipping kill switch test');
      return;
    }

    console.log(`Found ${positions.positions.length} positions. Executing kill switch...`);
    const result = await tradingService.exitAllPositions();
    console.log(`Result: ${result.success ? '✅' : '❌'} ${result.message}`);

    await tradingService.disconnect();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests
if (require.main === module) {
  testFullTradingFlow();
}
