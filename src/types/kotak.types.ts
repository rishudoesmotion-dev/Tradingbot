// Kotak Neo API Types

// ============ Authentication ============
export interface KotakLoginRequest {
  mobileNumber: string;
  ucc: string;
  totp: string;
}

export interface KotakTotpValidationResponse {
  data: {
    token: string;
    sid: string;
  };
}

export interface KotakMpinValidateRequest {
  mpin: string;
}

export interface KotakMpinValidateResponse {
  data: {
    token: string;
    sid: string;
    baseUrl: string;
  };
}

// ============ Order Management ============
export interface KotakOrderRequest {
  am?: string; // Auto-generate margin
  dq?: string; // Dummy quantity
  bc?: string; // Bracket order cover percentage
  es: string; // Exchange segment (e.g., "nse_cm", "nse_fo", "bse_cm")
  mp?: string; // Margin percentage
  pc: string; // Product code (CNC, NRML, MIS, etc.)
  pf?: string; // Profit flag
  pr: string; // Price
  pt: string; // Price type (L=Limit, M=Market)
  qt: string; // Quantity
  rt: string; // Retention type (DAY, GTT, IOC, FOK)
  tp?: string; // Trail price
  ts: string; // Token symbol
  tt: string; // Transaction type (B=Buy, S=Sell)
  nc?: string; // No of orders
  cl?: string; // Cover loss
  si?: string; // Stop loss interval
  sy?: string; // Stop loss symbol
  sn?: string; // Stop loss number
  cf?: string; // Cover flag
}

export interface KotakOrderResponse {
  stat: string;
  nOrdNo: string;
  [key: string]: any;
}

export interface KotakModifyOrderRequest extends KotakOrderRequest {
  no: string; // Order number to modify
  vd?: string; // Valid days
}

export interface KotakCancelOrderRequest {
  on: string; // Order number
  am: string; // Auto-generate margin
}

export interface KotakExitOrderRequest {
  on: string; // Order number
  am: string; // Auto-generate margin
}

// ============ Order Management Response ============
export interface KotakExchangeExitResponse {
  stat: string;
  [key: string]: any;
}

// ============ Report APIs ============
export interface KotakOrderHistoryRequest {
  nOrdNo: string;
}

export interface KotakOrderHistoryResponse {
  stat: string;
  data: KotakOrder[];
}

export interface KotakOrder {
  nOrdNo: string;
  scsymbol: string;
  qty: number;
  price: number;
  stat: string;
  exch: string;
  [key: string]: any;
}

export interface KotakOrderBookResponse {
  stat: string;
  data: KotakOrder[];
}

export interface KotakTradeBookResponse {
  stat: string;
  data: KotakTrade[];
}

export interface KotakTrade {
  nOrdNo: string;
  exOrdNo: string;
  qty: number;
  price: number;
  [key: string]: any;
}

export interface KotakPositionBookResponse {
  stat: string;
  data: KotakPosition[];
}

export interface KotakPosition {
  scsymbol: string;
  qty: number;
  price: number;
  [key: string]: any;
}

export interface KotakHoldingsResponse {
  stat: string;
  data: KotakHolding[];
}

export interface KotakHolding {
  scsymbol: string;
  qty: number;
  price: number;
  [key: string]: any;
}

// ============ Risk Management ============
export interface KotakCheckMarginRequest {
  brkName: string;
  brnchId: string;
  exSeg: string;
  prc: string;
  prcTp: string;
  prod: string;
  qty: string;
  tok: string;
  trnsTp: string;
}

export interface KotakCheckMarginResponse {
  stat: string;
  [key: string]: any;
}

export interface KotakLimitsRequest {
  exch: string; // ALL or specific exchange
  seg: string; // ALL or specific segment
  prod: string; // ALL or specific product
}

export interface KotakLimitsResponse {
  stat: string;
  data: KotakLimitData[];
}

export interface KotakLimitData {
  exch: string;
  seg: string;
  prod: string;
  [key: string]: any;
}

// ============ Quotes & Master Data ============
export interface KotakQuoteRequest {
  neosymbol: string;
}

export interface KotakQuoteResponse {
  stat: string;
  data: {
    [key: string]: KotakQuote;
  };
}

export interface KotakQuote {
  symbol: string;
  price: number;
  [key: string]: any;
}

export interface KotakScripMasterResponse {
  stat: string;
  data: string[]; // File paths to download
}

// ============ Session/Configuration ============
export interface KotakSessionConfig {
  consumerKey: string;
  mobileNumber: string;
  ucc: string;
  totp: string;
  mpin: string;
}

export interface KotakSession {
  sid: string;
  sessionToken: string;
  baseUrl: string;
  viewToken?: string;
  sidView?: string;
}

// ============ Error Response ============
export interface KotakErrorResponse {
  stat: string;
  emsg?: string;
  error?: string;
  [key: string]: any;
}

// ============ Exchange & Segment Types ============
export type KotakExchange = "nse_cm" | "nse_fo" | "bse_cm" | "bse_fo" | "mcx_fo" | "ncdex_fo";

export type KotakProductCode = "CNC" | "NRML" | "MIS" | "BO" | "CO";

export type KotakTransactionType = "B" | "S";

export type KotakPriceType = "L" | "M";

export type KotakRetentionType = "DAY" | "GTT" | "IOC" | "FOK";
