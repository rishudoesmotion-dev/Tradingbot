// src/lib/services/KotakTradingService.ts
import { BrokerFactory } from '@/lib/brokers/BrokerFactory';
import { OrderSide, OrderType, ProductType } from '@/types/broker.types';
import { BaseBroker } from '@/lib/brokers/BaseBroker';
import { quotesService } from '@/lib/services/QuotesService';

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

      // Wire quotesService so it can fetch live market data via proxy
      quotesService.setSession({
        tradingToken: sessionInfo.tradingToken,
        tradingSid: sessionInfo.tradingSid,
        baseUrl: sessionInfo.baseUrl,
        consumerKey: this.consumerKey,
      });
      console.log('✅ QuotesService session configured for live prices');

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

      // 401 = session expired — throw a recognisable error so callers can force re-login
      if (response.status === 401 && data?.error === 'SESSION_EXPIRED') {
        const err = new Error('SESSION_EXPIRED');
        (err as any).isSessionExpired = true;
        throw err;
      }

      if (!response.ok) {
        const errMsg = data?.error || `API call failed: ${response.statusText}`;
        console.error(`[KotakTradingService] ❌ ${action} HTTP error (${response.status}):`, data);
        throw new Error(errMsg);
      }

      console.log(`[KotakTradingService] 📥 ${action} proxy response:`, data);
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
      console.log('[KotakTradingService] ❌ getPositions: Service not ready');
      return { success: false, positions: [], message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        console.log('[KotakTradingService] 📤 getPositions: Fetching via API...');
        const result = await this.callTradingAPI('GET', 'getPositions');
        console.log('[KotakTradingService] 📥 getPositions raw result:', JSON.stringify(result));

        // Kotak response structure can be:
        // 1. { stat: "Ok", stCode: 200, data: [...positions] }   ← most common
        // 2. [...positions]                                        ← direct array
        // 3. { positions: [...] }                                  ← wrapped
        let positions: any[] = [];
        if (result?.data && Array.isArray(result.data)) {
          positions = result.data;
        } else if (Array.isArray(result)) {
          positions = result;
        } else if (result?.positions && Array.isArray(result.positions)) {
          positions = result.positions;
        }

        console.log(`[KotakTradingService] ✅ getPositions: Extracted ${positions.length} positions`, positions);

        return {
          success: true,
          positions,
          count: positions.length,
          totalPnL: positions.reduce((sum: number, p: any) => {
            const buy = parseFloat(p.buyAmt || '0');
            const sell = parseFloat(p.sellAmt || '0');
            const qty = parseInt(p.qty || '0', 10);
            const ltp = parseFloat(p.ltp || p.ltP || '0');
            // unrealised P&L = sell - buy + (net qty * ltp)
            return sum + (sell - buy + qty * ltp);
          }, 0),
        };
      }

      // Legacy: use broker directly
      console.log('[KotakTradingService] 📤 getPositions: Using broker directly...');
      const positions = await this.broker!.getPositions();
      console.log('[KotakTradingService] 📥 getPositions broker result:', positions);

      return {
        success: true,
        positions,
        count: positions.length,
        totalPnL: positions.reduce((sum, p) => sum + (p.pnl || 0), 0),
      };
    } catch (error) {
      console.error('[KotakTradingService] ❌ getPositions error:', error);
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
   * Get LTP for a symbol using the Quotes API (proxied, session-aware)
   */
  async getLTP(symbol: string, exchangeSegment: string = 'nse_cm') {
    if (!this.isReady()) {
      return { success: false, ltp: 0, message: 'Service not initialized' };
    }

    try {
      console.log(`[KotakTradingService] 📤 Fetching LTP for ${symbol} (${exchangeSegment})`);

      const ltp = await quotesService.getLTP(exchangeSegment, symbol);

      console.log(`[KotakTradingService] ✅ LTP fetched: ${symbol} = ₹${ltp}`);

      return { success: ltp > 0, symbol, ltp };
    } catch (error) {
      console.error(`[KotakTradingService] ❌ Failed to fetch LTP for ${symbol}:`, error);
      return {
        success: false,
        symbol,
        ltp: 0,
        message: `❌ Failed to fetch LTP: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Batch LTP fetch for multiple positions (single API call – efficient)
   * Returns a map of symbol → ltp
   */
  async getBatchLTP(
    queries: Array<{ segment: string; symbol: string }>
  ): Promise<Map<string, number>> {
    return quotesService.getBatchLTP(queries);
  }

  /**
   * Get full quote data (LTP, OHLC, depth) for a symbol
   */
  async getQuote(symbol: string, exchangeSegment: string = 'nse_cm') {
    try {
      console.log(`[KotakTradingService] 📤 Fetching quote for ${symbol} (${exchangeSegment})`);
      
      const quote = await quotesService.getFullQuote(exchangeSegment, symbol);
      
      if (!quote) {
        return { success: false, quote: null, message: 'Quote not found' };
      }
      
      console.log(`[KotakTradingService] ✅ Quote fetched:`, quote);
      
      return {
        success: true,
        quote,
      };
    } catch (error) {
      console.error(`[KotakTradingService] ❌ Failed to fetch quote for ${symbol}:`, error);
      return {
        success: false,
        quote: null,
        message: `❌ Failed to fetch quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get all orders for the day
   */
  async getOrders() {
    if (!this.isReady()) {
      console.log('[KotakTradingService] ❌ getOrders: Service not ready');
      return { success: false, orders: [], message: 'Service not initialized' };
    }

    try {
      // Use API proxy if session-based
      if (this.sessionInfo) {
        console.log('[KotakTradingService] 📤 getOrders: Fetching via API...');
        const result = await this.callTradingAPI('GET', 'getOrders');
        console.log('[KotakTradingService] 📥 getOrders raw result:', JSON.stringify(result));
        
        // callTradingAPI returns data.data from route, which is the full Kotak response:
        // { stat: "Ok", stCode: 200, data: [...orders] }
        let orders: any[] = [];
        if (result?.data && Array.isArray(result.data)) {
          orders = result.data;
        } else if (Array.isArray(result)) {
          orders = result;
        } else if (result?.orders && Array.isArray(result.orders)) {
          orders = result.orders;
        }
        
        console.log(`[KotakTradingService] ✅ getOrders: Extracted ${orders.length} orders`, orders);
        
        return {
          success: true,
          orders: orders,
          count: orders.length,
        };
      }

      // Legacy: use broker directly
      console.log('[KotakTradingService] 📤 getOrders: Using broker directly...');
      const orders = await this.broker!.getOrders();
      console.log('[KotakTradingService] 📥 getOrders broker result:', orders);
      
      return {
        success: true,
        orders,
        count: orders.length,
      };
    } catch (error) {
      console.error('[KotakTradingService] ❌ getOrders error:', error);
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
    quotesService.clearSession();
    this.sessionInfo = null;
    this.isAuthenticated = false;
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
