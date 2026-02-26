// src/lib/services/TradingDataService.ts
/**
 * Trading Data Service
 * Fetches historical order and trade data from Supabase
 */

import { createClient } from '@supabase/supabase-js';

interface TradeLog {
  id: string;
  order_id: string;
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  pnl: number;
  timestamp: string;
  broker_name: string;
  created_at: string;
}

interface DailyStats {
  trade_date: string;
  total_trades: number;
  realized_pnl: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
}

class TradingDataService {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get all trade logs
   */
  async getTradeHistory(): Promise<TradeLog[]> {
    try {
      const { data, error } = await this.supabase
        .from('trade_logs')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching trade history:', error);
      return [];
    }
  }

  /**
   * Get daily statistics
   */
  async getDailyStats(): Promise<DailyStats[]> {
    try {
      const { data, error } = await this.supabase.from('daily_stats').select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching daily stats:', error);
      return [];
    }
  }

  /**
   * Get stats for last N days
   */
  async getRecentStats(days: number = 30): Promise<DailyStats[]> {
    try {
      const { data, error } = await this.supabase
        .from('daily_stats')
        .select('*')
        .gte('trade_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('trade_date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching recent stats:', error);
      return [];
    }
  }

  /**
   * Calculate aggregated statistics
   */
  async getAggregatedStats(): Promise<{
    totalTrades: number;
    totalProfit: number;
    totalLoss: number;
    winRate: number;
    avgProfit: number;
  }> {
    try {
      const trades = await this.getTradeHistory();

      if (trades.length === 0) {
        return {
          totalTrades: 0,
          totalProfit: 0,
          totalLoss: 0,
          winRate: 0,
          avgProfit: 0,
        };
      }

      const totalProfit = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
      const totalLoss = trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0);
      const winningTrades = trades.filter((t) => t.pnl > 0).length;
      const winRate = (winningTrades / trades.length) * 100;
      const netProfit = totalProfit + totalLoss;
      const avgProfit = netProfit / trades.length;

      return {
        totalTrades: trades.length,
        totalProfit,
        totalLoss,
        winRate: Math.round(winRate * 10) / 10,
        avgProfit: Math.round(avgProfit * 10) / 10,
      };
    } catch (error) {
      console.error('Error calculating aggregated stats:', error);
      return {
        totalTrades: 0,
        totalProfit: 0,
        totalLoss: 0,
        winRate: 0,
        avgProfit: 0,
      };
    }
  }

  /**
   * Get trades for a specific symbol
   */
  async getSymbolTrades(symbol: string): Promise<TradeLog[]> {
    try {
      const { data, error } = await this.supabase
        .from('trade_logs')
        .select('*')
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error fetching trades for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Add a new trade log
   */
  async addTradeLog(trade: Omit<TradeLog, 'id' | 'created_at'>): Promise<TradeLog | null> {
    try {
      const { data, error } = await this.supabase
        .from('trade_logs')
        .insert([trade])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding trade log:', error);
      return null;
    }
  }

  /**
   * Update trade log (for adding P&L after closing position)
   */
  async updateTradePnL(orderId: string, pnl: number): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('trade_logs')
        .update({ pnl })
        .eq('order_id', orderId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating trade PnL:', error);
      return false;
    }
  }
}

// Singleton instance
let instance: TradingDataService | null = null;

export function getTradingDataService(): TradingDataService {
  if (!instance) {
    instance = new TradingDataService();
  }
  return instance;
}
