/**
 * ShoonyaAdapter - Pure REST HTTP Implementation
 * 
 * NO npm packages needed! Just pure fetch() calls to Shoonya REST API
 * Reference: https://shoonya.com/api-documentation
 */

import { BaseBroker } from './BaseBroker';
import {
  BrokerCredentials,
  Order,
  OrderRequest,
  Position,
  MarketDepth,
  OrderType,
  OrderSide,
  OrderStatus,
  ProductType
} from '@/types/broker.types';

// ============================================================================
// SHOONYA API TYPES
// ============================================================================

interface ShoonyaCredentials {
  userId: string;
  password: string;
  vendorCode: string;
  apiKey: string;
  apiSecret: string;
  imei: string;
  factor2?: string;
}

interface ShoonyaSessionData {
  susertoken: string;
  uid: string;
  actid: string;
  loginTime: Date;
  expiryTime: Date;
}

interface LoginPayload {
  uid: string;
  pwd: string;
  vc: string;
  appkey: string;
  imei: string;
  factor2?: string;
  apkversion?: string;
}

interface LoginResponse {
  stat: 'Ok' | 'Not_Ok';
  susertoken?: string;
  uid?: string;
  actid?: string;
  imei?: string;
  message?: string;
  emsg?: string;
}

interface PlaceOrderPayload {
  uid: string;
  actid: string;
  exch: string;
  tsym: string;
  qty: string;
  prc: string;
  prd: string;
  prctyp: string;
  ret: string;
  trantype: string;
  dscqty?: string;
  trgprc?: string;
  remarks?: string;
}

interface PlaceOrderResponse {
  stat: 'Ok' | 'Not_Ok';
  norenordno?: string;
  uid?: string;
  actid?: string;
  message?: string;
  emsg?: string;
  exchordid?: string;
  tsym?: string;
  qty?: string;
  prc?: string;
  prd?: string;
  trantype?: string;
  prctyp?: string;
  status?: string;
  rpt?: string;
}

interface OrderBookResponse {
  stat: 'Ok' | 'Not_Ok';
  values?: OrderBookItem[];
  emsg?: string;
}

interface OrderBookItem {
  norenordno: string;
  uid: string;
  actid: string;
  exch: string;
  tsym: string;
  qty: string;
  prc: string;
  prd: string;
  trantype: string;
  prctyp: string;
  ret: string;
  status: string;
  reporttype: string;
  fillshares: string;
  avgprc: string;
  rejreason?: string;
  cancelqty?: string;
  exchordid?: string;
  remarks?: string;
  dscqty?: string;
  trgprc?: string;
  fltm?: string;
}

interface PositionBookResponse {
  stat: 'Ok' | 'Not_Ok';
  values?: PositionBookItem[];
  emsg?: string;
}

interface PositionBookItem {
  exch: string;
  tsym: string;
  token: string;
  uid: string;
  actid: string;
  prd: string;
  netqty: string;
  netavgprc: string;
  daybuyqty: string;
  daysellqty: string;
  daybuyavgprc: string;
  daysellavgprc: string;
  cfbuyqty: string;
  cfsellqty: string;
  cfbuyavgprc: string;
  cfsellavgprc: string;
  lp: string;
  rpnl: string;
  urmtom: string;
  bep: string;
  openbuyqty: string;
  opensellqty: string;
  mult: string;
  pp: string;
  prcftr: string;
  ti: string;
  ls: string;
}

interface LogoutResponse {
  stat: 'Ok' | 'Not_Ok';
  message?: string;
  emsg?: string;
}

// ============================================================================
// SHOONYA ADAPTER CLASS
// ============================================================================

export class ShoonyaAdapter extends BaseBroker {
  private shoonyaCredentials: ShoonyaCredentials;
  private sessionData: ShoonyaSessionData | null = null;
  private sessionRefreshTimer: NodeJS.Timeout | null = null;
  private readonly API_BASE_URL = 'https://api.shoonya.com/NorenWClientTP';
  private readonly SESSION_TIMEOUT_MS = 60 * 60 * 1000;
  private readonly SESSION_REFRESH_BEFORE_MS = 5 * 60 * 1000;

  constructor(credentials: BrokerCredentials) {
    super(credentials);

    this.shoonyaCredentials = {
      userId: credentials.userId,
      password: credentials.password || '',
      vendorCode: credentials.vendorCode || '',
      apiKey: credentials.apiKey || '',
      apiSecret: credentials.apiSecret || '',
      imei: credentials.imei || '',
      factor2: credentials.factor2,
    };

    this.validateCredentials(this.shoonyaCredentials);
    
    // Satisfy BaseBroker's protected credentials requirement
    this.credentials = credentials;
  }

  /**
   * Validate credentials format
   */
  private validateCredentials(creds: ShoonyaCredentials): void {
    const required = ['userId', 'password', 'vendorCode', 'apiKey', 'apiSecret', 'imei'];
    const missing = required.filter(key => !creds[key as keyof ShoonyaCredentials]);

    if (missing.length > 0) {
      throw new Error(`Missing required credentials: ${missing.join(', ')}`);
    }

    if (!/^\d{15}$/.test(creds.imei)) {
      throw new Error(`Invalid IMEI format. Expected 15 digits, got: ${creds.imei}`);
    }
  }

  /**
   * Generic HTTP request maker
   */
  private async request<T>(endpoint: string, payload: Record<string, any>): Promise<T> {
    const url = `${this.API_BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: T = await response.json();
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Shoonya API Error on ${endpoint}: ${errorMsg}`);
    }
  }

  /**
   * Authenticate with Shoonya API
   */
  async authenticate(): Promise<boolean> {
    try {
      const payload: LoginPayload = {
        uid: this.shoonyaCredentials.userId,
        pwd: this.shoonyaCredentials.password,
        vc: this.shoonyaCredentials.vendorCode,
        appkey: this.shoonyaCredentials.apiKey,
        imei: this.shoonyaCredentials.imei,
        factor2: this.shoonyaCredentials.factor2,
        apkversion: 'trading-terminal:1.0.0',
      };

      console.log('🔐 Authenticating with Shoonya...');
      const response = await this.request<LoginResponse>('/Login', payload);

      if (response.stat !== 'Ok' || !response.susertoken) {
        throw new Error(`Login failed: ${response.emsg || response.message || response.stat}`);
      }

      this.sessionData = {
        susertoken: response.susertoken,
        uid: response.uid || this.shoonyaCredentials.userId,
        actid: response.actid || '',
        loginTime: new Date(),
        expiryTime: new Date(Date.now() + this.SESSION_TIMEOUT_MS),
      };

      console.log('✅ Login successful!', {
        uid: this.sessionData.uid,
        actid: this.sessionData.actid,
      });

      this.isAuthenticated = true;
      this.setupSessionRefresh();

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Authentication failed:', errorMsg);
      throw error;
    }
  }

  /**
   * Setup automatic session refresh
   */
  private setupSessionRefresh(): void {
    if (this.sessionRefreshTimer) {
      clearTimeout(this.sessionRefreshTimer);
    }

    if (!this.sessionData) return;

    const timeUntilRefresh =
      this.sessionData.expiryTime.getTime() -
      Date.now() -
      this.SESSION_REFRESH_BEFORE_MS;

    if (timeUntilRefresh > 0) {
      this.sessionRefreshTimer = setTimeout(() => {
        console.log('🔄 Session token expiring soon, refreshing...');
        this.authenticate().catch(err => {
          console.error('Failed to refresh session:', err);
        });
      }, timeUntilRefresh);
    }
  }

  /**
   * Check if session is active
   */
  private ensureSessionActive(): void {
    if (!this.sessionData) {
      throw new Error('Session not initialized. Call authenticate() first.');
    }

    if (new Date() > this.sessionData.expiryTime) {
      throw new Error('Session expired. Please authenticate again.');
    }
  }

  /**
   * Place an order
   */
  async placeOrder(orderRequest: OrderRequest): Promise<Order> {
    this.ensureSessionActive();

    if (!this.sessionData) throw new Error('Session data missing');

    try {
      this.validateOrderRequest(orderRequest);

      const shoonyaOrder: PlaceOrderPayload = {
        uid: this.sessionData.uid,
        actid: this.sessionData.actid,
        exch: this.mapExchange(orderRequest.exchange),
        tsym: orderRequest.symbol,
        qty: orderRequest.quantity.toString(),
        prc: (orderRequest.price || 0).toString(),
        prd: this.mapProductType(orderRequest.productType),
        prctyp: this.mapOrderType(orderRequest.orderType),
        ret: 'DAY',
        trantype: orderRequest.side === OrderSide.BUY ? 'B' : 'S',
        dscqty: (orderRequest.disclosedQuantity || 0).toString(),
        trgprc: (orderRequest.triggerPrice || 0).toString(),
      };

      console.log('📤 Placing order:', {
        symbol: orderRequest.symbol,
        qty: orderRequest.quantity,
        price: orderRequest.price,
      });

      const response = await this.request<PlaceOrderResponse>('/PlaceOrder', shoonyaOrder);

      if (response.stat !== 'Ok' || !response.norenordno) {
        throw new Error(`Order placement failed: ${response.emsg || response.stat}`);
      }

      console.log('✅ Order placed successfully!', {
        orderNo: response.norenordno,
      });

      return {
        orderId: response.norenordno,
        symbol: orderRequest.symbol,
        exchange: orderRequest.exchange,
        quantity: orderRequest.quantity,
        filledQuantity: 0,
        price: orderRequest.price || 0,
        averagePrice: 0,
        side: orderRequest.side,
        orderType: orderRequest.orderType,
        productType: orderRequest.productType,
        status: OrderStatus.PENDING,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Order placement error:', errorMsg);
      throw error;
    }
  }

  /**
   * Modify an order
   */
  async modifyOrder(
    orderId: string,
    modifications: Partial<OrderRequest>
  ): Promise<Order> {
    this.ensureSessionActive();

    // Not fully implemented in REST adapter
    throw new Error('modifyOrder not yet implemented');
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    this.ensureSessionActive();

    if (!this.sessionData) throw new Error('Session data missing');

    try {
      const payload = {
        uid: this.sessionData.uid,
        actid: this.sessionData.actid,
        orderno: orderId,
      };

      console.log('🔴 Cancelling order:', { orderId });

      const response = await this.request<PlaceOrderResponse>('/CancelOrder', payload);

      if (response.stat !== 'Ok') {
        throw new Error(`Cancel failed: ${response.emsg || response.stat}`);
      }

      console.log('✅ Order cancelled successfully!');
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Order cancellation error:', errorMsg);
      throw error;
    }
  }

  /**
   * Get all orders
   */
  async getOrders(): Promise<Order[]> {
    this.ensureSessionActive();

    if (!this.sessionData) throw new Error('Session data missing');

    try {
      const payload = {
        uid: this.sessionData.uid,
        actid: this.sessionData.actid,
      };

      console.log('📋 Fetching order book...');

      const response = await this.request<OrderBookResponse>('/OrderBook', payload);

      if (response.stat !== 'Ok') {
        throw new Error(`Failed to fetch orders: ${response.emsg || response.stat}`);
      }

      const orders: Order[] = (response.values || []).map(item => ({
        orderId: item.norenordno,
        symbol: item.tsym,
        exchange: item.exch as any,
        quantity: parseInt(item.qty),
        filledQuantity: parseInt(item.fillshares || '0'),
        price: parseFloat(item.prc),
        averagePrice: parseFloat(item.avgprc || '0'),
        side: item.trantype === 'B' ? OrderSide.BUY : OrderSide.SELL,
        orderType: this.mapOrderTypeReverse(item.prctyp),
        productType: this.mapProductTypeReverse(item.prd),
        status: this.mapOrderStatus(item.status),
        timestamp: new Date(),
      }));

      console.log(`✅ Fetched ${orders.length} orders`);
      return orders;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to fetch orders:', errorMsg);
      throw error;
    }
  }

  /**
   * Get all positions
   */
  async getPositions(): Promise<Position[]> {
    this.ensureSessionActive();

    if (!this.sessionData) throw new Error('Session data missing');

    try {
      const payload = {
        uid: this.sessionData.uid,
        actid: this.sessionData.actid,
      };

      console.log('📊 Fetching positions...');

      const response = await this.request<PositionBookResponse>('/PositionBook', payload);

      if (response.stat !== 'Ok') {
        throw new Error(`Failed to fetch positions: ${response.emsg || response.stat}`);
      }

      const positions: Position[] = (response.values || []).map(item => {
        const netQty = parseInt(item.netqty);
        const buyQty = parseInt(item.daybuyqty) + parseInt(item.cfbuyqty);
        const sellQty = parseInt(item.daysellqty) + parseInt(item.cfsellqty);
        const netAvgPrice = parseFloat(item.netavgprc);
        const ltp = parseFloat(item.lp);
        const pnl = parseFloat(item.urmtom) + parseFloat(item.rpnl);
        const pnlPercentage =
          netAvgPrice > 0 ? ((ltp - netAvgPrice) / netAvgPrice) * 100 : 0;

        return {
          symbol: item.tsym,
          exchange: item.exch as any,
          productType: this.mapProductTypeReverse(item.prd),
          quantity: netQty,
          buyQuantity: buyQty,
          sellQuantity: sellQty,
          buyPrice: netQty > 0 ? netAvgPrice : 0,
          sellPrice: netQty < 0 ? netAvgPrice : 0,
          ltp: ltp,
          pnl: pnl,
          pnlPercentage: pnlPercentage,
        };
      });

      console.log(`✅ Fetched ${positions.length} positions`);
      return positions;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to fetch positions:', errorMsg);
      throw error;
    }
  }

  /**
   * Exit a position
   */
  async exitPosition(symbol: string, productType?: string): Promise<Order> {
    try {
      const positions = await this.getPositions();
      const position = positions.find(p => p.symbol === symbol);

      if (!position || position.quantity === 0) {
        throw new Error(`No open position for ${symbol}`);
      }

      console.log(`🚨 Exiting position: ${symbol} (qty: ${position.quantity})`);

      const order = await this.placeOrder({
        symbol: position.symbol,
        exchange: position.exchange,
        side: position.quantity > 0 ? OrderSide.SELL : OrderSide.BUY,
        quantity: Math.abs(position.quantity),
        orderType: OrderType.MARKET,
        productType: position.productType,
      });

      console.log('✅ Position exited!');
      return order;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to exit position:', errorMsg);
      throw error;
    }
  }

  /**
   * Get balance (not available via REST)
   */
  async getBalance(): Promise<number> {
    throw new Error('getBalance not available in Shoonya REST API');
  }

  /**
   * Get market depth (not available via REST)
   */
  async getMarketDepth(symbol: string): Promise<MarketDepth> {
    throw new Error('getMarketDepth not available in Shoonya REST API');
  }

  /**
   * Disconnect session
   */
  async disconnect(): Promise<void> {
    try {
      if (this.sessionRefreshTimer) {
        clearTimeout(this.sessionRefreshTimer);
      }

      if (!this.sessionData) {
        console.log('No active session to logout');
        return;
      }

      const payload = {
        uid: this.sessionData.uid,
        actid: this.sessionData.actid,
      };

      console.log('👋 Logging out from Shoonya...');

      const response = await this.request<LogoutResponse>('/Logout', payload);

      if (response.stat === 'Ok') {
        console.log('✅ Logout successful!');
      } else {
        console.warn('⚠️ Logout response:', response);
      }

      this.sessionData = null;
      this.isAuthenticated = false;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Logout error:', errorMsg);
    }
  }

  /**
   * Validate order request
   */
  private validateOrderRequest(order: OrderRequest): void {
    if (!order.symbol) throw new Error('Symbol is required');
    if (!order.exchange) throw new Error('Exchange is required');
    if (!order.side) throw new Error('Side is required');
    if (order.quantity <= 0) throw new Error('Quantity must be positive');
  }

  /**
   * Mapping functions
   */

  private mapExchange(exchange: string): string {
    const mapping: Record<string, string> = {
      NSE: 'NSE',
      NFO: 'NFO',
      BSE: 'BSE',
      CDS: 'CDS',
      MCX: 'MCX',
    };
    return mapping[exchange] || exchange;
  }

  private mapOrderType(orderType: OrderType): string {
    const mapping: Record<OrderType, string> = {
      [OrderType.MARKET]: 'MKT',
      [OrderType.LIMIT]: 'LMT',
      [OrderType.SL]: 'SL-MKT',
      [OrderType.SL_M]: 'SL-LMT',
    };
    return mapping[orderType];
  }

  private mapOrderTypeReverse(prctyp: string): OrderType {
    const mapping: Record<string, OrderType> = {
      MKT: OrderType.MARKET,
      LMT: OrderType.LIMIT,
      'SL-MKT': OrderType.SL,
      'SL-LMT': OrderType.SL_M,
    };
    return mapping[prctyp] || OrderType.LIMIT;
  }

  private mapProductType(productType: ProductType): string {
    const mapping: Record<ProductType, string> = {
      [ProductType.INTRADAY]: 'M',
      [ProductType.DELIVERY]: 'C',
      [ProductType.MARGIN]: 'H',
    };
    return mapping[productType];
  }

  private mapProductTypeReverse(prd: string): ProductType {
    const mapping: Record<string, ProductType> = {
      C: ProductType.DELIVERY,
      M: ProductType.INTRADAY,
      H: ProductType.MARGIN,
      B: ProductType.INTRADAY,
    };
    return mapping[prd] || ProductType.INTRADAY;
  }

  private mapOrderStatus(status: string): OrderStatus {
    const mapping: Record<string, OrderStatus> = {
      New: OrderStatus.PENDING,
      Pending: OrderStatus.PENDING,
      Complete: OrderStatus.COMPLETE,
      Rejected: OrderStatus.REJECTED,
      Cancelled: OrderStatus.CANCELLED,
      Filled: OrderStatus.COMPLETE,
    };
    return mapping[status] || OrderStatus.PENDING;
  }

  /**
   * Get LTP - Last Traded Price
   */
  async getLTP(symbol: string, exchange: string): Promise<number> {
    this.ensureSessionActive();
    
    try {
      const positions = await this.getPositions();
      const position = positions.find(p => p.symbol === symbol);

      if (position) {
        return position.ltp;
      }

      throw new Error(`Symbol ${symbol} not found in positions`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to get LTP for ${symbol}:`, errorMsg);
      throw error;
    }
  }

  /**
   * Exit all positions
   */
  async exitAllPositions(): Promise<Order[]> {
    try {
      const positions = await this.getPositions();

      if (positions.length === 0) {
        console.log('No open positions to exit');
        return [];
      }

      console.log(`🚨 Exiting ${positions.length} positions...`);

      const exitOrders: Order[] = [];

      for (const position of positions) {
        if (position.quantity !== 0) {
          try {
            const order = await this.exitPosition(position.symbol);
            exitOrders.push(order);
          } catch (error) {
            console.error(`Failed to exit ${position.symbol}:`, error);
          }
        }
      }

      console.log('✅ All positions exited!');
      return exitOrders;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to exit all positions:', errorMsg);
      throw error;
    }
  }

  /**
   * Subscribe to market data
   */
  subscribeToMarketData(
    symbols: Array<{ symbol: string; exchange: string }>,
    callback: (data: MarketDepth) => void
  ): void {
    console.log('⚠️ subscribeToMarketData requires WebSocket implementation');
    console.log('Symbols:', symbols);
  }

  /**
   * Unsubscribe from market data
   */
  unsubscribeFromMarketData(): void {
    console.log('⚠️ unsubscribeFromMarketData requires WebSocket implementation');
  }
}