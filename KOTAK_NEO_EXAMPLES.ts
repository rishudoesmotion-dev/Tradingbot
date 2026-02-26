// Example: Complete Kotak Neo Trading Integration

import { BrokerFactory, BrokerType } from '@/lib/brokers/BrokerFactory';
import { OrderType, OrderSide, ProductType } from '@/types/broker.types';
import { useTradingStore } from '@/store/tradingStore';

/**
 * Complete example demonstrating Kotak Neo API integration
 */
export class KotakNeoTradingExample {
  private broker = BrokerFactory.createFromEnv();
  private store = useTradingStore();

  /**
   * Initialize connection to Kotak Neo broker
   */
  async connect() {
    try {
      console.log('🔌 Connecting to Kotak Neo...');
      const authenticated = await this.broker.authenticate();

      if (!authenticated) {
        throw new Error('Authentication failed');
      }

      console.log('✅ Successfully connected to Kotak Neo');
      this.store.setBroker(this.broker);
    } catch (error) {
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  /**
   * Place a BUY order for a symbol
   */
  async placeBuyOrder(symbol: string, quantity: number, price: number) {
    try {
      console.log(`📝 Placing BUY order for ${symbol}...`);

      const order = await this.broker.placeOrder({
        symbol: symbol,
        exchange: 'NSE',
        side: OrderSide.BUY,
        quantity: quantity,
        price: price,
        orderType: OrderType.LIMIT,
        productType: ProductType.INTRADAY,
      });

      console.log(`✅ Order placed successfully: ${order.orderId}`);
      console.log(`   Symbol: ${order.symbol}`);
      console.log(`   Quantity: ${order.quantity}`);
      console.log(`   Price: ${order.price}`);
      console.log(`   Status: ${order.status}`);

      return order;
    } catch (error) {
      console.error(`❌ Failed to place order:`, error);
      throw error;
    }
  }

  /**
   * Get all open positions
   */
  async getPositions() {
    try {
      console.log('📊 Fetching positions...');

      const positions = await this.broker.getPositions();

      if (positions.length === 0) {
        console.log('No open positions');
        return positions;
      }

      console.log(`✅ Found ${positions.length} position(s):`);
      positions.forEach((pos, index) => {
        console.log(`
  ${index + 1}. ${pos.symbol}
     Quantity: ${pos.quantity}
     Avg Buy Price: Rs${pos.buyPrice}
     Current Price: Rs${pos.ltp}
     P&L: Rs${pos.pnl} (${pos.pnlPercentage}%)
     Exchange: ${pos.exchange}
     Product: ${pos.productType}
        `);
      });

      return positions;
    } catch (error) {
      console.error('❌ Failed to fetch positions:', error);
      throw error;
    }
  }

  /**
   * Exit ALL positions (Kill Switch)
   */
  async exitAllPositions() {
    try {
      console.log('KILL SWITCH ACTIVATED - Exiting all positions...');

      const exitOrders = await this.broker.exitAllPositions();

      if (exitOrders.length === 0) {
        console.log('No positions to exit');
        return exitOrders;
      }

      console.log(`✅ Exited ${exitOrders.length} position(s):`);
      exitOrders.forEach((order, index) => {
        console.log(`
  ${index + 1}. ${order.symbol}
     Order ID: ${order.orderId}
     Quantity: ${order.filledQuantity}
     Price: Rs${order.averagePrice}
        `);
      });

      return exitOrders;
    } catch (error) {
      console.error('❌ Kill switch failed:', error);
      throw error;
    }
  }

  /**
   * Get account balance and margin
   */
  async getBalance() {
    try {
      console.log('Fetching account balance...');

      const balance = await this.broker.getBalance();

      console.log(`✅ Account Balance: Rs${balance}`);

      return balance;
    } catch (error) {
      console.error('❌ Failed to fetch balance:', error);
      throw error;
    }
  }

  /**
   * Disconnect from broker
   */
  async disconnect() {
    try {
      console.log('Disconnecting...');
      await this.broker.disconnect();
      console.log('✅ Disconnected from Kotak Neo');
    } catch (error) {
      console.error('❌ Disconnection error:', error);
    }
  }
}

// Export for use in applications
export default KotakNeoTradingExample;
