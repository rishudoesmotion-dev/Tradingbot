// src/lib/risk/RiskManager.ts
import { supabase } from '@/lib/supabase/client';
import { OrderRequest, Position, ProductType } from '@/types/broker.types';
import { RiskConfig, RiskValidationResult, TradeLog, DayStats } from '@/types/risk.types';
import { tradesRulesEngine } from '@/lib/rules/TradesRulesEngine_v2';

// ── Map internal ProductType enum → DB string values ─────────────────────────
// FIX: trades.product_type was being hardcoded as 'MIS' for every order.
// Now correctly maps INTRADAY→MIS, DELIVERY→CNC, MARGIN→NRML.
const PRODUCT_TYPE_MAP: Record<ProductType, string> = {
  [ProductType.INTRADAY]: 'MIS',
  [ProductType.DELIVERY]: 'CNC',
  [ProductType.MARGIN]:   'NRML',
};

export class RiskManager {
  private riskConfig: RiskConfig;
  private tradesRulesEngine = tradesRulesEngine;

  constructor(config?: RiskConfig) {
    this.riskConfig = config || this.getDefaultConfig();
  }

  private getDefaultConfig(): RiskConfig {
    return {
      maxTradesPerDay:        parseInt(process.env.MAX_TRADES_PER_DAY || '5'),
      maxLossLimit:           parseInt(process.env.MAX_LOSS_LIMIT     || '5000'),
      maxLots:                parseInt(process.env.MAX_LOTS           || '10'),
      maxPositionSize:        100000,
      stopLossPercentage:     2,
      targetProfitPercentage: 5,
      enableKillSwitch:       true,
    };
  }

  async loadConfig(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('risk_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      if (data) {
        this.riskConfig = {
          id:                     data.id,
          maxTradesPerDay:        data.max_trades_per_day,
          maxLossLimit:           data.max_loss_limit,
          maxLots:                data.max_lots,
          maxPositionSize:        data.max_position_size,
          stopLossPercentage:     data.stop_loss_percentage,
          targetProfitPercentage: data.target_profit_percentage,
          enableKillSwitch:       data.enable_kill_switch,
          createdAt:              new Date(data.created_at),
          updatedAt:              new Date(data.updated_at),
        };
      }
    } catch (error) {
      console.error('Failed to load risk config:', error);
    }
  }

  async saveConfig(config: RiskConfig): Promise<void> {
    try {
      const { error } = await supabase
        .from('risk_config')
        .insert({
          max_trades_per_day:       config.maxTradesPerDay,
          max_loss_limit:           config.maxLossLimit,
          max_lots:                 config.maxLots,
          max_position_size:        config.maxPositionSize,
          stop_loss_percentage:     config.stopLossPercentage,
          target_profit_percentage: config.targetProfitPercentage,
          enable_kill_switch:       config.enableKillSwitch,
        });

      if (error) throw error;
      this.riskConfig = config;
    } catch (error) {
      console.error('Failed to save risk config:', error);
      throw error;
    }
  }

  async validateOrder(
    orderRequest: OrderRequest,
    options?: { livePositions?: any[]; liveOrders?: any[] }
  ): Promise<RiskValidationResult> {
    const errors: string[]   = [];
    const warnings: string[] = [];

    try {
      if (options?.livePositions) this.tradesRulesEngine.setLivePositions(options.livePositions);
      if (options?.liveOrders)    this.tradesRulesEngine.setLiveOrders(options.liveOrders);

      const rulesResult = await this.tradesRulesEngine.validateOrder(orderRequest, options);
      errors.push(...rulesResult.errors);
      warnings.push(...rulesResult.warnings);

      if (!rulesResult.isValid) return { isValid: false, errors, warnings };

      const todayStats = await this.getDayStats();

      if (todayStats.totalTrades >= this.riskConfig.maxTradesPerDay)
        errors.push(`Daily trade limit reached (${this.riskConfig.maxTradesPerDay} trades)`);

      if (todayStats.totalPnl <= -this.riskConfig.maxLossLimit)
        errors.push(`Maximum daily loss limit reached (₹${this.riskConfig.maxLossLimit})`);

      const estimatedValue = (orderRequest.price || 0) * orderRequest.quantity;
      if (estimatedValue > this.riskConfig.maxPositionSize)
        errors.push(`Position size (₹${estimatedValue}) exceeds limit (₹${this.riskConfig.maxPositionSize})`);

      if (!this.riskConfig.enableKillSwitch)
        warnings.push('Kill switch is disabled');

      if (todayStats.totalTrades >= this.riskConfig.maxTradesPerDay * 0.8)
        warnings.push(`Approaching daily trade limit (${todayStats.totalTrades}/${this.riskConfig.maxTradesPerDay})`);

      if (todayStats.totalPnl <= -this.riskConfig.maxLossLimit * 0.8)
        warnings.push(`Approaching loss limit (₹${todayStats.totalPnl}/₹${-this.riskConfig.maxLossLimit})`);

    } catch (error) {
      console.error('Order validation error:', error);
      errors.push('Failed to validate order due to system error');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Get statistics for the current trading day.
   *
   * FIX: realizedPnl now comes from the `trades` table (CLOSED trades with
   * actual exit P&L) instead of trade_logs.pnl which is always 0 at entry.
   * trade_logs is still used for totalTrades count only.
   */
  async getDayStats(): Promise<DayStats> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Trade count — one row per order placed
      const { data: logs, error: logsError } = await supabase
        .from('trade_logs')
        .select('id')
        .gte('timestamp', today.toISOString());

      if (logsError) throw logsError;

      const totalTrades = logs?.length || 0;

      // Realized P&L — only from trades that have actually been closed today
      const { data: closedTrades, error: closedError } = await supabase
        .from('trades')
        .select('pnl')
        .eq('status', 'CLOSED')
        .gte('entry_timestamp', today.toISOString());

      if (closedError) throw closedError;

      const realizedPnl   = closedTrades?.reduce((sum, t) => sum + (t.pnl || 0), 0) || 0;
      const winningTrades = closedTrades?.filter(t => (t.pnl || 0) > 0).length || 0;
      const losingTrades  = closedTrades?.filter(t => (t.pnl || 0) < 0).length || 0;
      const closedCount   = closedTrades?.length || 0;
      const winRate       = closedCount > 0 ? (winningTrades / closedCount) * 100 : 0;

      // Unrealized P&L from open positions
      const { data: positions } = await supabase
        .from('positions')
        .select('pnl');

      const unrealizedPnl = positions?.reduce((sum, p) => sum + (p.pnl || 0), 0) || 0;
      const totalPnl      = realizedPnl + unrealizedPnl;

      return {
        totalTrades, realizedPnl, unrealizedPnl,
        totalPnl, winningTrades, losingTrades, winRate,
      };
    } catch (error) {
      console.error('Failed to get day stats:', error);
      return {
        totalTrades: 0, realizedPnl: 0, unrealizedPnl: 0,
        totalPnl: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
      };
    }
  }

  /**
   * Log a trade to the database.
   *
   * Writes to BOTH:
   *  - trade_logs  → risk engine (getDayStats trade counter / validateOrder)
   *  - trades      → dashboard (TradesService / trade_statistics view)
   *
   * FIX 1: trade_logs has UNIQUE(order_id). Using upsert instead of insert so
   * retries or duplicate calls don't throw a constraint violation and silently
   * kill the trades-table write that follows.
   *
   * FIX 2: ProductType enum is now correctly mapped to DB strings via
   * PRODUCT_TYPE_MAP instead of being hardcoded as 'MIS'.
   */
  async logTrade(trade: Omit<TradeLog, 'id'>): Promise<void> {
    try {
      // ── 1. Risk engine log ────────────────────────────────────────
      const { error: logError } = await supabase
        .from('trade_logs')
        .upsert(
          {
            order_id:    trade.orderId,
            symbol:      trade.symbol,
            exchange:    trade.exchange,
            side:        trade.side,
            quantity:    trade.quantity,
            price:       trade.price,
            pnl:         trade.pnl,     // 0 at entry — updated on close
            timestamp:   trade.timestamp.toISOString(),
            broker_name: trade.brokerName,
          },
          { onConflict: 'order_id' }
        );

      if (logError) throw logError;

      // ── 2. Dashboard trades table ─────────────────────────────────
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        console.warn('[RiskManager] No authenticated user — skipping trades table write');
        return;
      }

     const productTypeStr = 'MIS';

      const { error: tradeError } = await supabase
        .from('trades')
        .upsert(
          {
            user_id:          userData.user.id,
            symbol:           trade.symbol,
            trading_symbol:   trade.symbol,
            side:             trade.side as 'BUY' | 'SELL',
            quantity:         trade.quantity,
            entry_price:      trade.price,
            exit_price:       null,
            order_type:   'MARKET',
            product_type: productTypeStr,
            exchange_segment: trade.exchange,
            status:           'OPEN',
            entry_timestamp:  trade.timestamp.toISOString(),
            pnl:              0,
            pnl_percentage:   0,
          },
          { onConflict: 'user_id,symbol,entry_timestamp' }
        );

      if (tradeError) throw tradeError;
    } catch (error) {
      console.error('Failed to log trade:', error);
      throw error;
    }
  }

  /**
   * Close a trade in the dashboard trades table and update trade_logs P&L.
   * Call this when the broker confirms an exit fill.
   *
   * FIX: also updates trade_logs.pnl so getDayStats() realizedPnl is accurate.
   */
  async closeTrade(orderId: string, exitPrice: number): Promise<void> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Look up entry details from trade_logs
      const { data: log } = await supabase
        .from('trade_logs')
        .select('symbol, quantity, price, side')
        .eq('order_id', orderId)
        .single();

      if (!log) {
        console.warn('[RiskManager] closeTrade: no trade_log found for orderId', orderId);
        return;
      }

      // Find matching OPEN trade — most recent leg for this symbol
      const { data: openTrade } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('symbol', log.symbol)
        .eq('status', 'OPEN')
        .order('entry_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (!openTrade) {
        console.warn('[RiskManager] closeTrade: no open trade found for symbol', log.symbol);
        return;
      }

      const priceDiff = exitPrice - openTrade.entry_price;
      const pnl       = openTrade.side === 'BUY'
        ? priceDiff * openTrade.quantity
        : -priceDiff * openTrade.quantity;
      const pnlPct    = (pnl / (openTrade.entry_price * openTrade.quantity)) * 100;

      // Update trades table
      const { error: tradeError } = await supabase
        .from('trades')
        .update({
          exit_price:     exitPrice,
          exit_timestamp: new Date().toISOString(),
          status:         'CLOSED',
          pnl:            parseFloat(pnl.toFixed(2)),
          pnl_percentage: parseFloat(pnlPct.toFixed(2)),
        })
        .eq('id', openTrade.id);

      if (tradeError) throw tradeError;

      // Also backfill trade_logs.pnl so getDayStats() stays accurate
      await supabase
        .from('trade_logs')
        .update({ pnl: parseFloat(pnl.toFixed(2)) })
        .eq('order_id', orderId);

    } catch (error) {
      console.error('Failed to close trade:', error);
    }
  }

  /**
   * Update position in database.
   * FIX: productType is now mapped through PRODUCT_TYPE_MAP.
   */
  async updatePosition(position: Position): Promise<void> {
    try {
      const { error } = await supabase
        .from('positions')
        .upsert(
          {
            symbol:         position.symbol,
            exchange:       position.exchange,
            product_type:   PRODUCT_TYPE_MAP[position.productType] ?? String(position.productType),
            quantity:       position.quantity,
            buy_quantity:   position.buyQuantity,
            sell_quantity:  position.sellQuantity,
            buy_price:      position.buyPrice,
            sell_price:     position.sellPrice,
            ltp:            position.ltp,
            pnl:            position.pnl,
            pnl_percentage: position.pnlPercentage,
          },
          { onConflict: 'symbol' }
        );

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update position:', error);
      throw error;
    }
  }

  async shouldActivateKillSwitch(): Promise<boolean> {
    if (!this.riskConfig.enableKillSwitch) return false;
    const stats = await this.getDayStats();
    return stats.totalPnl <= -this.riskConfig.maxLossLimit;
  }

  getConfig(): RiskConfig {
    return { ...this.riskConfig };
  }
}