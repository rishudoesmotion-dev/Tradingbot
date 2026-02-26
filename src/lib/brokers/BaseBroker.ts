// src/lib/brokers/BaseBroker.ts
import {
  BrokerCredentials,
  Order,
  OrderRequest,
  Position,
  MarketDepth
} from '@/types/broker.types';

/**
 * Abstract Base Broker Class
 * This ensures all broker adapters implement the same interface
 * Following the Adapter Pattern for broker-agnostic architecture
 */
export abstract class BaseBroker {
  protected credentials: BrokerCredentials;
  protected isAuthenticated: boolean = false;

  constructor(credentials: BrokerCredentials) {
    this.credentials = credentials;
  }

  /**
   * Authenticate with the broker
   * @returns Promise<boolean> - Authentication status
   */
  abstract authenticate(): Promise<boolean>;

  /**
   * Place an order
   * @param orderRequest - Order details
   * @returns Promise<Order> - Placed order details
   */
  abstract placeOrder(orderRequest: OrderRequest): Promise<Order>;

  /**
   * Cancel an order
   * @param orderId - Order ID to cancel
   * @returns Promise<boolean> - Cancellation status
   */
  abstract cancelOrder(orderId: string): Promise<boolean>;

  /**
   * Modify an existing order
   * @param orderId - Order ID to modify
   * @param modifications - New order details
   * @returns Promise<Order> - Modified order details
   */
  abstract modifyOrder(orderId: string, modifications: Partial<OrderRequest>): Promise<Order>;

  /**
   * Get all orders for the day
   * @returns Promise<Order[]> - List of orders
   */
  abstract getOrders(): Promise<Order[]>;

  /**
   * Get all positions
   * @returns Promise<Position[]> - List of positions
   */
  abstract getPositions(): Promise<Position[]>;

  /**
   * Get Last Traded Price (LTP) for a symbol
   * @param symbol - Trading symbol
   * @param exchange - Exchange name
   * @returns Promise<number> - Last traded price
   */
  abstract getLTP(symbol: string, exchange: string): Promise<number>;

  /**
   * Get market depth for a symbol
   * @param symbol - Trading symbol
   * @param exchange - Exchange name
   * @returns Promise<MarketDepth> - Market depth data
   */
  abstract getMarketDepth(symbol: string, exchange: string): Promise<MarketDepth>;

  /**
   * Exit a specific position
   * @param symbol - Trading symbol
   * @param productType - Product type
   * @returns Promise<Order> - Exit order details
   */
  abstract exitPosition(symbol: string, productType: string): Promise<Order>;

  /**
   * Exit all positions (Kill Switch)
   * @returns Promise<Order[]> - All exit orders
   */
  abstract exitAllPositions(): Promise<Order[]>;

  /**
   * Get account balance
   * @returns Promise<number> - Available margin/balance
   */
  abstract getBalance(): Promise<number>;

  /**
   * Subscribe to WebSocket for real-time data
   * @param symbols - Array of symbols to subscribe
   * @param callback - Callback function for updates
   */
  abstract subscribeToMarketData(
    symbols: Array<{ symbol: string; exchange: string }>,
    callback: (data: MarketDepth) => void
  ): void;

  /**
   * Unsubscribe from WebSocket
   */
  abstract unsubscribeFromMarketData(): void;

  /**
   * Check if broker is authenticated
   */
  isConnected(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Disconnect from broker
   */
  abstract disconnect(): Promise<void>;
}
