// src/types/shoonya.types.ts
/**
 * Shoonya API Type Definitions
 * Based on official Shoonya API documentation
 */

export interface ShoonyaCredentials {
  userId: string;
  password: string;
  vendorCode: string;
  apiKey: string;
  apiSecret: string;
  imei: string;
  factor2?: string; // TOTP (optional)
  appVersion?: string; // Default: from package.json
}

export interface ShoonyaLoginRequest {
  uid: string;
  pwd: string;
  vc: string;
  appkey: string;
  imei: string;
  factor2?: string;
  apkversion?: string;
}

export interface ShoonyaLoginResponse {
  stat: 'Ok' | 'Not_Ok';
  susertoken: string;
  loginid: string;
  email?: string;
  actid?: string;
  prarr?: Array<{
    prd: string;
    ptype: string;
    exch: string;
  }>;
}

export interface ShoonyaSessionData {
  token: string;
  loginid: string;
  userToken: string;
  email?: string;
  accountId?: string;
  products?: string[];
  expiresAt: Date;
}

export interface ShoonyaOrderRequest {
  loginid: string;
  token: string;
  buy_or_sell: 'B' | 'S';
  ordersource?: string;
  tradingsymbol: string;
  exch_tsym: string;
  exchange: 'NSE' | 'BSE' | 'NFO' | 'MCX';
  quantity: number;
  disclosedqty?: number;
  price: number;
  trigger_price?: number;
  pricetype: 'LMT' | 'MKT' | 'SL-LMT' | 'SL-MKT';
  product_type: 'I' | 'C' | 'M';
  ordertype?: 'REGULAR' | 'OCO' | 'BRACKETORDER';
  retention: 'DAY' | 'IOC' | 'GTT' | 'GTC';
  remarks?: string;
  modity?: 'ADD' | 'MOD' | 'DEL';
  orderid?: string; // For modify/cancel
  tag?: string;
  stoplosvalue?: number;
  takeprofitvalue?: number;
}

export interface ShoonyaOrderResponse {
  stat: 'Ok' | 'Not_Ok';
  norenordno?: string;
  orderid?: string;
  message?: string;
  code?: string;
}

export interface ShoonyaOrderBook {
  stat: 'Ok' | 'Not_Ok';
  data?: Array<{
    orderid: string;
    norenordno: string;
    exchange: string;
    tradingsymbol: string;
    exch_tsym: string;
    qty: number;
    filledqty: number;
    price: number;
    pricetype: string;
    buy_or_sell: string;
    product_type: string;
    orderstatus: 'Pending' | 'Open' | 'Complete' | 'Rejected' | 'Cancelled' | 'Suspended';
    executiontime: string;
    exchordid: string;
    averageprice: number;
    remarks?: string;
  }>;
}

export interface ShoonyaPosition {
  exch: string;
  symbol: string;
  exc_tsym: string;
  quantity: number;
  netqty: number;
  buyqty: number;
  sellqty: number;
  buyprc: number;
  sellprc: number;
  netprc: number;
  pnl: number;
  pnlpc: number;
  daybuyprc: number;
  daysellprc: number;
  daybuyqty: number;
  daysellqty: number;
  product_type: 'I' | 'C' | 'M';
}

export interface ShoonyaPositionBook {
  stat: 'Ok' | 'Not_Ok';
  data?: ShoonyaPosition[];
}

export interface ShoonyaQuote {
  stat: 'Ok' | 'Not_Ok';
  exch: string;
  tradingsymbol: string;
  ltp: number;
  ltq: number;
  ltt?: string;
  volume: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  close: number;
  oi?: number;
  week52high?: number;
  week52low?: number;
  multip: number;
}

export interface ShoonyaSearchSymbol {
  stat: 'Ok' | 'Not_Ok';
  values?: Array<{
    symbol: string;
    exch: string;
    token: string;
    expiry?: string;
    opttype?: string;
    strikePrice?: string;
    lotsize: number;
  }>;
}

export interface ShoonyaHoldings {
  stat: 'Ok' | 'Not_Ok';
  data?: Array<{
    symbol: string;
    isin: string;
    quantity: number;
    t1quantity: number;
    carryforwardqty: number;
    collateral: number;
    collateralqty: number;
    pledgedqty: number;
    haircut: number;
    price: number;
    product_type: string;
  }>;
}

export interface ShoonyaLimits {
  stat: 'Ok' | 'Not_Ok';
  cash: number;
  aavail: number;
  payin: number;
  payout: number;
  brkcollamt: number;
  unclearedcash: number;
  daybrokerage: number;
  marginused: number;
  marginavail: number;
  totalmargin: number;
  collateral: number;
  brkncollamt: number;
  netcash: number;
  mtmnet: number;
}

export enum ShoonyaOrderStatus {
  PENDING = 'Pending',
  OPEN = 'Open',
  COMPLETE = 'Complete',
  REJECTED = 'Rejected',
  CANCELLED = 'Cancelled',
  SUSPENDED = 'Suspended'
}

export enum ShoonyaPriceType {
  LIMIT = 'LMT',
  MARKET = 'MKT',
  SL_LIMIT = 'SL-LMT',
  SL_MARKET = 'SL-MKT'
}

export enum ShoonyaProductType {
  INTRADAY = 'I',
  DELIVERY = 'C',
  MARGIN = 'M'
}

export enum ShoonyaExchange {
  NSE = 'NSE',
  BSE = 'BSE',
  NFO = 'NFO',
  MCX = 'MCX'
}
