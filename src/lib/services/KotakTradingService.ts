// src/lib/services/KotakTradingService.ts
import { BrokerFactory } from '@/lib/brokers/BrokerFactory';
import { OrderSide, OrderType, ProductType } from '@/types/broker.types';
import { BaseBroker } from '@/lib/brokers/BaseBroker';

export interface TradeConfig {
  symbol: string;
  quantity: number;
  price?: number;
  orderType: OrderType;
  productType: ProductType;
}

export interface TradeResponse {
  success: boolean;
  orderId?: string;
  message: string;
  data?: any;
}

export interface SessionInfo {
  tradingToken: string;
  tradingSid: string;
  baseUrl: string;
  headers?: Record<string, string>;
}

export class KotakTradingService {
  private broker: BaseBroker | null = null;
  private isAuthenticated = false;
  private sessionInfo: SessionInfo | null = null;
  private consumerKey = 'c63d7961-e935-4bce-8183-c63d9d2342f0'; // From env

  /**
   * Initialize with session info (after authentication)
   * This uses API proxy instead of direct broker calls
   */
  async initializeWithSession(sessionInfo: SessionInfo): Promise<boolean> {
    try {
      this.sessionInfo = sessionInfo;
      console.log('✅ Kotak Neo session initialized');
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.error('❌ Session initialization error:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * Initialize and authenticate with Kotak Neo (legacy - for backward compatibility)
   */
  async initialize(): Promise<boolean> {
    try {
      this.broker = BrokerFactory.createFromEnv();
      this.isAuthenticated = await this.broker.authenticate();
      
      if (this.isAuthenticated) {
        console.log('✅ Kotak Neo authenticated successfully');
      } else {
        console.error('❌ Authentication failed');
      }
      
      return this.isAuthenticated;
    } catch (error) {
      console.error('❌ Initialization error:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isAuthenticated && (!!this.broker || !!this.sessionInfo);
  }

  /**
   * Make a trading API call through the proxy
   */
  private async callTradingAPI(
    method: 'GET' | 'POST',
    action: string,
    params?: any
  ): Promise<any> {
    if (!this.sessionInfo) {
      throw new Error('Session not initialized. Please authenticate first.');
    }

    if (method === 'GET') {
      const queryParams = new URLSearchParams({
        action,
        tradingToken: this.sessionInfo.tradingToken,
        tradingSid: this.sessionInfo.tradingSid,
        baseUrl: this.sessionInfo.baseUrl,
        consumerKey: this.consumerKey,
        ...params,
      });

      const response = await fetch(`/api/kotak/trade?${queryParams.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API call failed: ${response.statusText}`);
      }

      return data.data;
    } else {
      // POST
      const response = await fetch('/api/kotak/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          tradingToken: this.sessionInfo.tradingToken,
          tradingSid: this.sessionInfo.tradingSid,
          baseUrl: this.sessionInfo.baseUrl,
          consumerKey: this.consumerKey,
          ...params,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API call failed: ${response.statusText}`);
      }

      return data.data;
    }
  }

  /**
   * Buy order
   */
  async buy(config: { symbol: string; quantity: number; price?: number; productType: ProductType }): Promise<TradeResponse> {
    if (!this.isReady()) {
      return { success: false, message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        const result = await this.callTradingAPI('POST', 'placeOrder', {
          symbol: config.symbol,
          exchange: this.getExchange(config.symbol),
          side: 'BUY',
          quantity: config.quantity,
          price: config.price || 0,
          orderType: 'MARKET',
          productType: config.productType,
        });

        return {
          success: true,
          orderId: result?.orderId,
          message: `✅ Buy order placed: ${result?.orderId}`,
          data: result,
        };
      }

      // Legacy: use broker directly
      const order = await this.broker!.placeOrder({
        symbol: config.symbol,
        exchange: this.getExchange(config.symbol),
        side: OrderSide.BUY,
        quantity: config.quantity,
        price: config.price || 0,
        orderType: OrderType.MARKET,
        productType: config.productType,
      });

      return {
        success: true,
        orderId: order.orderId,
        message: `✅ Buy order placed: ${order.orderId}`,
        data: order,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Buy failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Sell order
   */
  async sell(config: { symbol: string; quantity: number; price?: number; productType: ProductType }): Promise<TradeResponse> {
    if (!this.isReady()) {
      return { success: false, message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        const result = await this.callTradingAPI('POST', 'placeOrder', {
          symbol: config.symbol,
          exchange: this.getExchange(config.symbol),
          side: 'SELL',
          quantity: config.quantity,
          price: config.price || 0,
          orderType: 'MARKET',
          productType: config.productType,
        });

        return {
          success: true,
          orderId: result?.orderId,
          message: `✅ Sell order placed: ${result?.orderId}`,
          data: result,
        };
      }

      // Legacy: use broker directly
      const order = await this.broker!.placeOrder({
        symbol: config.symbol,
        exchange: this.getExchange(config.symbol),
        side: OrderSide.SELL,
        quantity: config.quantity,
        price: config.price || 0,
        orderType: OrderType.MARKET,
        productType: config.productType,
      });

      return {
        success: true,
        orderId: order.orderId,
        message: `✅ Sell order placed: ${order.orderId}`,
        data: order,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Sell failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<TradeResponse> {
    if (!this.isReady()) {
      return { success: false, message: 'Service not initialized' };
    }

    try {
      const cancelled = await this.broker!.cancelOrder(orderId);
      
      return {
        success: cancelled,
        message: cancelled ? `✅ Order cancelled: ${orderId}` : `❌ Failed to cancel order`,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Cancel failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Exit a position
   */
  async exitPosition(symbol: string): Promise<TradeResponse> {
    if (!this.isReady()) {
      return { success: false, message: 'Service not initialized' };
    }

    try {
      const order = await this.broker!.exitPosition(symbol, ProductType.INTRADAY);
      
      return {
        success: true,
        orderId: order.orderId,
        message: `✅ Position exited: ${order.orderId}`,
        data: order,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Exit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Emergency: Exit all positions (Kill Switch)
   */
  async exitAllPositions(): Promise<TradeResponse> {
    if (!this.isReady()) {
      return { success: false, message: 'Service not initialized' };
    }

    try {
      const orders = await this.broker!.exitAllPositions();
      
      return {
        success: true,
        message: `✅ Exited ${orders.length} positions`,
        data: { exitOrders: orders, count: orders.length },
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Kill switch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get current positions
   */
  async getPositions() {
    if (!this.isReady()) {
      return { success: false, positions: [], message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        const result = await this.callTradingAPI('GET', 'getPositions');
        const positions = result?.positions || [];
        return {
          success: true,
          positions,
          count: positions.length,
          totalPnL: positions.reduce((sum: number, p: any) => sum + (p.pnl || 0), 0),
        };
      }

      // Legacy: use broker directly
      const positions = await this.broker!.getPositions();
      
      return {
        success: true,
        positions,
        count: positions.length,
        totalPnL: positions.reduce((sum, p) => sum + p.pnl, 0),
      };
    } catch (error) {
      return {
        success: false,
        positions: [],
        message: `❌ Failed to fetch positions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get account balance
   */
  async getBalance() {
    if (!this.isReady()) {
      return { success: false, balance: 0, message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        const result = await this.callTradingAPI('GET', 'getUserLimits');
        // Extract Net/available balance from the response
        const balance = parseFloat(result?.Net || result?.balance || '0');
        return {
          success: true,
          balance,
          raw: result, // Return full response for debugging
        };
      }

      // Legacy: use broker directly
      const balance = await this.broker!.getBalance();
      
      return {
        success: true,
        balance,
      };
    } catch (error) {
      return {
        success: false,
        balance: 0,
        message: `❌ Failed to fetch balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get LTP for a symbol
   */
  async getLTP(symbol: string) {
    if (!this.isReady()) {
      return { success: false, ltp: 0, message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        const result = await this.callTradingAPI('GET', 'getLTP', { symbol });
        return {
          success: true,
          symbol,
          ltp: result?.ltp || 0,
        };
      }

      // Legacy: use broker directly
      const ltp = await this.broker!.getLTP(symbol, this.getExchange(symbol));
      
      return {
        success: true,
        symbol,
        ltp,
      };
    } catch (error) {
      return {
        success: false,
        symbol,
        ltp: 0,
        message: `❌ Failed to fetch LTP: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get all orders for the day
   */
  async getOrders() {
    if (!this.isReady()) {
      return { success: false, orders: [], message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        const result = await this.callTradingAPI('GET', 'getOrders');
        const orders = result?.orders || [];
        return {
          success: true,
          orders,
          count: orders.length,
        };
      }

      // Legacy: use broker directly
      const orders = await this.broker!.getOrders();
      
      return {
        success: true,
        orders,
        count: orders.length,
      };
    } catch (error) {
      return {
        success: false,
        orders: [],
        message: `❌ Failed to fetch orders: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Disconnect from broker
   */
  async disconnect(): Promise<void> {
    if (this.broker) {
      await this.broker.disconnect();
      this.isAuthenticated = false;
      console.log('✅ Disconnected from Kotak Neo');
    }
  }

  /**
   * Helper: Determine exchange from symbol
   */
  private getExchange(symbol: string): string {
    if (symbol.includes('-EQ')) return 'NSE';
    if (symbol.includes('-IDX')) return 'NSE';
    if (symbol.includes('-FUT')) return 'NFO';
    if (symbol.includes('-CE') || symbol.includes('-PE')) return 'NFO';
    return 'NSE'; // Default to NSE
  }
}

// Export singleton instance
export const kotakTradingService = new KotakTradingService();
