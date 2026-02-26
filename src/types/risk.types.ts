// src/types/risk.types.ts
export interface RiskConfig {
  id?: string;
  maxTradesPerDay: number;
  maxLossLimit: number;
  maxLots: number;
  maxPositionSize: number;
  stopLossPercentage: number;
  targetProfitPercentage: number;
  enableKillSwitch: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TradeLog {
  id?: string;
  orderId: string;
  symbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number;
  timestamp: Date;
  brokerName: string;
}

export interface RiskValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DayStats {
  totalTrades: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
}
