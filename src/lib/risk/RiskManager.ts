// src/lib/risk/RiskManager.ts
import { supabase } from '@/lib/supabase/client';
import { OrderRequest, Position } from '@/types/broker.types';
import { RiskConfig, RiskValidationResult, TradeLog, DayStats } from '@/types/risk.types';

/**
 * Risk Management Engine
 * This is the core logic layer that enforces trading rules
 * It sits between the UI and the Broker Adapter
 */
export class RiskManager {
  private riskConfig: RiskConfig;

  constructor(config?: RiskConfig) {
    this.riskConfig = config || this.getDefaultConfig();
  }

  /**
   * Get default risk configuration
   */
  private getDefaultConfig(): RiskConfig {
    return {
      maxTradesPerDay: parseInt(process.env.MAX_TRADES_PER_DAY || '5'),
      maxLossLimit: parseInt(process.env.MAX_LOSS_LIMIT || '5000'),
      maxLots: parseInt(process.env.MAX_LOTS || '10'),
      maxPositionSize: 100000,
      stopLossPercentage: 2,
      targetProfitPercentage: 5,
      enableKillSwitch: true
    };
  }

  /**
   * Load risk configuration from database
   */
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
          id: data.id,
          maxTradesPerDay: data.max_trades_per_day,
          maxLossLimit: data.max_loss_limit,
          maxLots: data.max_lots,
          maxPositionSize: data.max_position_size,
          stopLossPercentage: data.stop_loss_percentage,
          targetProfitPercentage: data.target_profit_percentage,
          enableKillSwitch: data.enable_kill_switch,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at)
        };
      }
    } catch (error) {
      console.error('Failed to load risk config:', error);
      // Use default config
    }
  }

  /**
   * Save risk configuration to database
   */
  async saveConfig(config: RiskConfig): Promise<void> {
    try {
      const { error } = await supabase
        .from('risk_config')
        .insert({
          max_trades_per_day: config.maxTradesPerDay,
          max_loss_limit: config.maxLossLimit,
          max_lots: config.maxLots,
          max_position_size: config.maxPositionSize,
          stop_loss_percentage: config.stopLossPercentage,
          target_profit_percentage: config.targetProfitPercentage,
          enable_kill_switch: config.enableKillSwitch
        });

      if (error) throw error;

      this.riskConfig = config;
    } catch (error) {
      console.error('Failed to save risk config:', error);
      throw error;
    }
  }

  /**
   * Validate an order before placement
   * This is the main risk validation logic
   */
  async validateOrder(orderRequest: OrderRequest): Promise<RiskValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. Trade Counter Check
      const todayStats = await this.getDayStats();
      if (todayStats.totalTrades >= this.riskConfig.maxTradesPerDay) {
        errors.push(`Daily trade limit reached (${this.riskConfig.maxTradesPerDay} trades)`);
      }

      // 2. Loss Guard Check
      if (todayStats.totalPnl <= -this.riskConfig.maxLossLimit) {
        errors.push(`Maximum daily loss limit reached (₹${this.riskConfig.maxLossLimit})`);
      }

      // 3. Lot Size Validator
      if (orderRequest.quantity > this.riskConfig.maxLots) {
        errors.push(`Order quantity (${orderRequest.quantity}) exceeds max lots (${this.riskConfig.maxLots})`);
      }

      // 4. Position Size Check
      const estimatedValue = (orderRequest.price || 0) * orderRequest.quantity;
      if (estimatedValue > this.riskConfig.maxPositionSize) {
        errors.push(`Position size (₹${estimatedValue}) exceeds limit (₹${this.riskConfig.maxPositionSize})`);
      }

      // 5. Kill Switch Check
      if (!this.riskConfig.enableKillSwitch) {
        warnings.push('Kill switch is disabled');
      }

      // 6. Warning for approaching limits
      if (todayStats.totalTrades >= this.riskConfig.maxTradesPerDay * 0.8) {
        warnings.push(`Approaching daily trade limit (${todayStats.totalTrades}/${this.riskConfig.maxTradesPerDay})`);
      }

      if (todayStats.totalPnl <= -this.riskConfig.maxLossLimit * 0.8) {
        warnings.push(`Approaching loss limit (₹${todayStats.totalPnl}/₹${-this.riskConfig.maxLossLimit})`);
      }

    } catch (error) {
      console.error('Order validation error:', error);
      errors.push('Failed to validate order due to system error');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get statistics for the current day
   */
  async getDayStats(): Promise<DayStats> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: trades, error } = await supabase
        .from('trade_logs')
        .select('*')
        .gte('timestamp', today.toISOString());

      if (error) throw error;

      const totalTrades = trades?.length || 0;
      const realizedPnl = trades?.reduce((sum, t) => sum + t.pnl, 0) || 0;
      
      // Get unrealized P&L from positions
      const { data: positions } = await supabase
        .from('positions')
        .select('pnl');

      const unrealizedPnl = positions?.reduce((sum, p) => sum + p.pnl, 0) || 0;
      const totalPnl = realizedPnl + unrealizedPnl;

      const winningTrades = trades?.filter(t => t.pnl > 0).length || 0;
      const losingTrades = trades?.filter(t => t.pnl < 0).length || 0;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      return {
        totalTrades,
        realizedPnl,
        unrealizedPnl,
        totalPnl,
        winningTrades,
        losingTrades,
        winRate
      };
    } catch (error) {
      console.error('Failed to get day stats:', error);
      return {
        totalTrades: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPnl: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0
      };
    }
  }

  /**
   * Log a trade to the database
   */
  async logTrade(trade: Omit<TradeLog, 'id'>): Promise<void> {
    try {
      const { error } = await supabase
        .from('trade_logs')
        .insert({
          order_id: trade.orderId,
          symbol: trade.symbol,
          exchange: trade.exchange,
          side: trade.side,
          quantity: trade.quantity,
          price: trade.price,
          pnl: trade.pnl,
          timestamp: trade.timestamp.toISOString(),
          broker_name: trade.brokerName
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to log trade:', error);
      throw error;
    }
  }

  /**
   * Update position in database
   */
  async updatePosition(position: Position): Promise<void> {
    try {
      const { error } = await supabase
        .from('positions')
        .upsert({
          symbol: position.symbol,
          exchange: position.exchange,
          product_type: position.productType,
          quantity: position.quantity,
          buy_quantity: position.buyQuantity,
          sell_quantity: position.sellQuantity,
          buy_price: position.buyPrice,
          sell_price: position.sellPrice,
          ltp: position.ltp,
          pnl: position.pnl,
          pnl_percentage: position.pnlPercentage
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update position:', error);
      throw error;
    }
  }

  /**
   * Check if kill switch should be activated
   */
  async shouldActivateKillSwitch(): Promise<boolean> {
    if (!this.riskConfig.enableKillSwitch) {
      return false;
    }

    const stats = await this.getDayStats();
    return stats.totalPnl <= -this.riskConfig.maxLossLimit;
  }

  /**
   * Get current risk configuration
   */
  getConfig(): RiskConfig {
    return { ...this.riskConfig };
  }
}
