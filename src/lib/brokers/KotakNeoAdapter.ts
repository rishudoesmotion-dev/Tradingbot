// src/lib/brokers/KotakNeoAdapter.ts
import { BaseBroker } from './BaseBroker';
import {
  BrokerCredentials,
  Order,
  OrderRequest,
  Position,
  MarketDepth,
  OrderType,
  OrderSide,
  ProductType,
  OrderStatus,
} from '@/types/broker.types';
import {
  KotakLoginRequest,
  KotakMpinValidateRequest,
  KotakMpinValidateResponse,
  KotakOrderRequest,
  KotakOrderResponse,
  KotakModifyOrderRequest,
  KotakCancelOrderRequest,
  KotakExitOrderRequest,
  KotakOrderBookResponse,
  KotakTradeBookResponse,
  KotakPositionBookResponse,
  KotakLimitsRequest,
  KotakLimitsResponse,
  KotakSession,
  KotakSessionConfig,
  KotakExchange,
  KotakProductCode,
  KotakTransactionType,
} from '@/types/kotak.types';

/**
 * Kotak Neo API Adapter
 * Implements the BaseBroker interface for Kotak Neo Securities
 * 
 * Authentication Flow:
 * 1. TOTP Validation (Mobile Number + UCC + TOTP)
 * 2. MPIN Validation (MPIN)
 * 3. Get session token and base URL
 */
export class KotakNeoAdapter extends BaseBroker {
  private session: KotakSession | null = null;
  private readonly API_BASE_LOGIN = 'https://mis.kotaksecurities.com';
  private readonly NEO_FIN_KEY = 'neotradeapi';
  private consumerKey: string;

  constructor(credentials: BrokerCredentials) {
    super(credentials);
    this.consumerKey = credentials.apiKey || '';
  }

  /**
   * Two-step authentication process
   * 1. Validate TOTP
   * 2. Validate MPIN
   */
  async authenticate(): Promise<boolean> {
    try {
      // Validate TOTP
      const totpResponse = await this.validateTotp();
      if (!totpResponse?.data?.token) {
        throw new Error('TOTP validation failed');
      }

      // Store temporary view session
      const viewToken = totpResponse.data.token;
      const sidView = totpResponse.data.sid;

      // Validate MPIN
      const mpinResponse = await this.validateMpin(viewToken, sidView);
      if (!mpinResponse?.data?.token) {
        throw new Error('MPIN validation failed');
      }

      // Store session
      this.session = {
        sid: mpinResponse.data.sid,
        sessionToken: mpinResponse.data.token,
        baseUrl: mpinResponse.data.baseUrl,
        viewToken,
        sidView,
      };

      this.isAuthenticated = true;
      console.log('Kotak Neo authentication successful');
      return true;
    } catch (error) {
      console.error('Kotak Neo authentication failed:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * Validate TOTP for initial login (via API proxy to avoid CORS)
   */
  private async validateTotp(): Promise<any> {
    const config = this.credentials.apiSecret as unknown as KotakSessionConfig;

    // Call the Next.js API proxy instead of direct browser call
    const response = await fetch('/api/kotak/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        step: 'totp',
        consumerKey: this.consumerKey,
        mobileNumber: config.mobileNumber,
        ucc: config.ucc,
        totp: config.totp,
      }),
    });

    if (!response.ok) {
      throw new Error(`TOTP validation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Validate MPIN for final authentication (via API proxy to avoid CORS)
   */
  private async validateMpin(viewToken: string, sidView: string): Promise<any> {
    const config = this.credentials.apiSecret as unknown as KotakSessionConfig;

    // Call the Next.js API proxy instead of direct browser call
    const response = await fetch('/api/kotak/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        step: 'mpin',
        consumerKey: this.consumerKey,
        viewToken: viewToken,
        viewSid: sidView,
        mpin: config.mpin,
      }),
    });

    if (!response.ok) {
      throw new Error(`MPIN validation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Place a new order
   */
  async placeOrder(orderRequest: OrderRequest): Promise<Order> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const kotakOrderRequest = this.mapOrderRequest(orderRequest);

    const formData = new URLSearchParams();
    formData.append('jData', JSON.stringify(kotakOrderRequest));

    const response = await fetch(
      `${this.session.baseUrl}/quick/order/rule/ms/place`,
      {
        method: 'POST',
        headers: {
          'Sid': this.session.sid,
          'Auth': this.session.sessionToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to place order: ${response.statusText}`);
    }

    const data: KotakOrderResponse = await response.json();
    if (data.stat !== 'Ok') {
      throw new Error(`Order placement failed: ${data.stat}`);
    }

    return this.mapOrderResponse(data);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const cancelRequest: KotakCancelOrderRequest = {
      on: orderId,
      am: 'NO',
    };

    const formData = new URLSearchParams();
    formData.append('jData', JSON.stringify(cancelRequest));

    const response = await fetch(
      `${this.session.baseUrl}/quick/order/cancel`,
      {
        method: 'POST',
        headers: {
          'Sid': this.session.sid,
          'Auth': this.session.sessionToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to cancel order: ${response.statusText}`);
    }

    const data = await response.json();
    return data.stat === 'Ok';
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(orderId: string, modifications: Partial<OrderRequest>): Promise<Order> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const kotakOrderRequest = this.mapOrderRequest(modifications as OrderRequest);
    const modifyRequest: KotakModifyOrderRequest = {
      ...kotakOrderRequest,
      no: orderId,
      vd: 'DAY',
    };

    const formData = new URLSearchParams();
    formData.append('jData', JSON.stringify(modifyRequest));

    const response = await fetch(
      `${this.session.baseUrl}/quick/order/vr/modify`,
      {
        method: 'POST',
        headers: {
          'Sid': this.session.sid,
          'Auth': this.session.sessionToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to modify order: ${response.statusText}`);
    }

    const data: KotakOrderResponse = await response.json();
    if (data.stat !== 'Ok') {
      throw new Error(`Order modification failed: ${data.stat}`);
    }

    return this.mapOrderResponse(data);
  }

  /**
   * Get all orders for the day
   */
  async getOrders(): Promise<Order[]> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${this.session.baseUrl}/quick/user/orders`,
      {
        method: 'GET',
        headers: {
          'Sid': this.session.sid,
          'Auth': this.session.sessionToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data: KotakOrderBookResponse = await response.json();
    if (data.stat !== 'Ok' || !data.data) {
      return [];
    }

    return data.data.map((order) => this.mapOrderResponse(order));
  }

  /**
   * Get all positions
   */
  async getPositions(): Promise<Position[]> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${this.session.baseUrl}/quick/user/positions`,
      {
        method: 'GET',
        headers: {
          'Sid': this.session.sid,
          'Auth': this.session.sessionToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch positions: ${response.statusText}`);
    }

    const data: KotakPositionBookResponse = await response.json();
    if (data.stat !== 'Ok' || !data.data) {
      return [];
    }

    return data.data.map((position) => ({
      symbol: position.scsymbol || '',
      exchange: 'NSE',
      productType: ProductType.INTRADAY,
      quantity: position.qty || 0,
      buyQuantity: position.qty > 0 ? position.qty : 0,
      sellQuantity: position.qty < 0 ? Math.abs(position.qty) : 0,
      buyPrice: typeof position.price === 'string' ? parseFloat(position.price) : (position.price as number) || 0,
      sellPrice: typeof position.price === 'string' ? parseFloat(position.price) : (position.price as number) || 0,
      ltp: typeof position.price === 'string' ? parseFloat(position.price) : (position.price as number) || 0,
      pnl: 0,
      pnlPercentage: 0,
    }));
  }

  /**
   * Get Last Traded Price
   */
  async getLTP(symbol: string, exchange: string): Promise<number> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const mappedExchange = this.mapExchange(exchange);
    const response = await fetch(
      `${this.session.baseUrl}/script-details/1.0/quotes/neosymbol/${mappedExchange}|${symbol}/all`,
      {
        method: 'GET',
        headers: {
          'Authorization': this.consumerKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch LTP: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data?.price || 0;
  }

  /**
   * Get market depth
   */
  async getMarketDepth(symbol: string, exchange: string): Promise<MarketDepth> {
    // Market depth might not be directly available from Kotak Neo REST API
    // Typically requires WebSocket connection
    // Returning quote data as fallback
    const ltp = await this.getLTP(symbol, exchange);

    return {
      symbol,
      ltp,
      bid: 0,
      ask: 0,
      bidQty: 0,
      askQty: 0,
      volume: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      change: 0,
      changePercentage: 0,
    };
  }

  /**
   * Exit a specific position
   */
  async exitPosition(symbol: string, productType: ProductType): Promise<Order> {
    // Get the position first
    const positions = await this.getPositions();
    const position = positions.find((p) => p.symbol === symbol);

    if (!position || position.quantity === 0) {
      throw new Error(`No open position for ${symbol}`);
    }

    // Create exit order
    const exitOrderRequest: OrderRequest = {
      symbol,
      exchange: 'NSE',
      quantity: Math.abs(position.quantity),
      price: 0,
      productType: productType,
      side: position.quantity > 0 ? OrderSide.SELL : OrderSide.BUY,
      orderType: OrderType.MARKET,
    };

    return this.placeOrder(exitOrderRequest);
  }

  /**
   * Exit all positions (Kill Switch)
   */
  async exitAllPositions(): Promise<Order[]> {
    const positions = await this.getPositions();
    const exitOrders: Order[] = [];

    for (const position of positions) {
      if (position.quantity !== 0) {
        try {
          const exitOrder = await this.exitPosition(position.symbol, ProductType.INTRADAY);
          exitOrders.push(exitOrder);
        } catch (error) {
          console.error(`Failed to exit position for ${position.symbol}:`, error);
        }
      }
    }

    return exitOrders;
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<number> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const limitsRequest: KotakLimitsRequest = {
      exch: 'ALL',
      seg: 'ALL',
      prod: 'ALL',
    };

    const formData = new URLSearchParams();
    formData.append('jData', JSON.stringify(limitsRequest));

    const response = await fetch(
      `${this.session.baseUrl}/quick/user/limits`,
      {
        method: 'POST',
        headers: {
          'Sid': this.session.sid,
          'Auth': this.session.sessionToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch balance: ${response.statusText}`);
    }

    const data: KotakLimitsResponse = await response.json();
    if (data.stat !== 'Ok' || !data.data || data.data.length === 0) {
      return 0;
    }

    // Return first margin limit as balance
    const limitData = data.data[0];
    return parseFloat((limitData as any).marginLimit) || 0;
  }

  /**
   * Subscribe to market data (WebSocket - not implemented in basic adapter)
   */
  subscribeToMarketData(
    symbols: Array<{ symbol: string; exchange: string }>,
    callback: (data: MarketDepth) => void
  ): void {
    console.warn('WebSocket subscription not implemented for Kotak Neo. Use REST polling instead.');
  }

  /**
   * Unsubscribe from market data
   */
  unsubscribeFromMarketData(): void {
    // No WebSocket to unsubscribe from
  }

  /**
   * Disconnect from broker
   */
  async disconnect(): Promise<void> {
    this.session = null;
    this.isAuthenticated = false;
  }

  // ============ Helper Methods ============

  /**
   * Map OrderRequest to KotakOrderRequest
   */
  private mapOrderRequest(order: OrderRequest): KotakOrderRequest {
    const exchangeMap: Record<string, KotakExchange> = {
      NSE: 'nse_cm',
      BSE: 'bse_cm',
      NFO: 'nse_fo',
      MCX: 'mcx_fo',
      NCDEX: 'ncdex_fo',
    };

    const productMap: Record<ProductType, KotakProductCode> = {
      [ProductType.DELIVERY]: 'CNC',
      [ProductType.INTRADAY]: 'MIS',
      [ProductType.MARGIN]: 'NRML',
    };

    const transactionTypeMap: Record<OrderSide, KotakTransactionType> = {
      [OrderSide.BUY]: 'B',
      [OrderSide.SELL]: 'S',
    };

    const priceTypeMap: Record<OrderType, string> = {
      [OrderType.LIMIT]: 'L',
      [OrderType.MARKET]: 'M',
      [OrderType.SL]: 'L',
      [OrderType.SL_M]: 'M',
    };

    const price = order.price || 0;

    return {
      es: exchangeMap[order.exchange] || 'nse_cm',
      ts: order.symbol,
      qt: order.quantity.toString(),
      pr: price.toString(),
      pc: productMap[order.productType] || 'NRML',
      tt: transactionTypeMap[order.side] || 'B',
      pt: priceTypeMap[order.orderType] || 'M',
      rt: 'DAY',
      am: 'NO',
      dq: '0',
      mp: '0',
      pf: 'N',
      tp: '0',
    };
  }

  /**
   * Map KotakOrderResponse to Order
   */
  private mapOrderResponse(kotakOrder: any): Order {
    return {
      orderId: kotakOrder.nOrdNo || '',
      symbol: kotakOrder.scsymbol || kotakOrder.ts || '',
      exchange: this.unmapExchange(kotakOrder.es || 'nse_cm'),
      side: (kotakOrder.tt === 'B' ? OrderSide.BUY : OrderSide.SELL),
      quantity: parseInt(kotakOrder.qty) || 0,
      filledQuantity: parseInt(kotakOrder.exQty) || 0,
      price: parseFloat(kotakOrder.price) || 0,
      averagePrice: parseFloat(kotakOrder.exPrice) || 0,
      orderType: OrderType.MARKET,
      productType: ProductType.INTRADAY,
      status: this.mapOrderStatus(kotakOrder.stat),
      timestamp: new Date(),
    };
  }

  /**
   * Map exchange abbreviations
   */
  private mapExchange(exchange: string): string {
    const exchangeMap: Record<string, KotakExchange> = {
      NSE: 'nse_cm',
      BSE: 'bse_cm',
      NFO: 'nse_fo',
      MCX: 'mcx_fo',
      NCDEX: 'ncdex_fo',
    };
    return exchangeMap[exchange] || 'nse_cm';
  }

  /**
   * Unmap exchange back to standard format
   */
  private unmapExchange(kotakExchange: string): string {
    const exchangeMap: Record<string, string> = {
      nse_cm: 'NSE',
      bse_cm: 'BSE',
      nse_fo: 'NFO',
      bse_fo: 'BSFO',
      mcx_fo: 'MCX',
      ncdex_fo: 'NCDEX',
    };
    return exchangeMap[kotakExchange] || 'NSE';
  }

  /**
   * Map Kotak order status to standard status
   */
  private mapOrderStatus(status: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      'Open': OrderStatus.OPEN,
      'Pending': OrderStatus.PENDING,
      'Executed': OrderStatus.COMPLETE,
      'Cancelled': OrderStatus.CANCELLED,
      'Rejected': OrderStatus.REJECTED,
      'PartiallyExecuted': OrderStatus.OPEN,
    };
    return statusMap[status] || OrderStatus.PENDING;
  }
}
