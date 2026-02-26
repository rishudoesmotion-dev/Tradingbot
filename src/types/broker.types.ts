// src/types/broker.types.ts
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  SL = 'SL',
  SL_M = 'SL_M'
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum ProductType {
  INTRADAY = 'INTRADAY',
  DELIVERY = 'DELIVERY',
  MARGIN = 'MARGIN'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  COMPLETE = 'COMPLETE',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export interface OrderRequest {
  symbol: string;
  exchange: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  productType: ProductType;
  price?: number;
  triggerPrice?: number;
  disclosedQuantity?: number;
}

export interface Order {
  orderId: string;
  symbol: string;
  exchange: string;
  side: OrderSide;
  quantity: number;
  filledQuantity: number;
  price: number;
  averagePrice: number;
  orderType: OrderType;
  productType: ProductType;
  status: OrderStatus;
  timestamp: Date;
  message?: string;
}

export interface Position {
  symbol: string;
  exchange: string;
  productType: ProductType;
  quantity: number;
  buyQuantity: number;
  sellQuantity: number;
  buyPrice: number;
  sellPrice: number;
  ltp: number;
  pnl: number;
  pnlPercentage: number;
}

export interface MarketDepth {
  symbol: string;
  ltp: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercentage: number;
}

export interface BrokerCredentials {
  userId: string;
  apiKey: string;
  apiSecret: string;
  vendorCode?: string;
  [key: string]: any;
}
