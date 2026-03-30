// src/lib/services/TradesService.ts
//
// FIX: removed inline createClient() — now uses the shared supabase singleton
// from @/lib/supabase/client so both RiskManager and TradesService share the
// same authenticated session. Previously they had two separate client instances
// which could cause RLS/session sync issues.
import { supabase } from '@/lib/supabase/client';

export interface Trade {
  id: number;
  user_id: string;
  symbol: string;
  trading_symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  order_type: string;
  product_type: string;
  exchange_segment: string;
  status: 'OPEN' | 'CLOSED' | 'REJECTED' | 'CANCELLED';
  entry_timestamp: string;
  exit_timestamp: string | null;
  pnl: number;
  pnl_percentage: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeStats {
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_gains: number;
  total_losses: number;
  net_pnl: number;
  avg_winning_trade: number;
  avg_losing_trade: number;
  avg_trade_pnl: number;
  last_trade_date: string | null;
}

class TradesService {
  /**
   * Get all trades for the current user
   */
  async getTrades(limit: number = 100, status?: 'OPEN' | 'CLOSED'): Promise<Trade[]> {
    try {
      let query = supabase
        .from('trades')
        .select('*')
        .order('entry_timestamp', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;

      if (error) {
        console.error('[TradesService] Error fetching trades:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[TradesService] Exception fetching trades:', error);
      return [];
    }
  }

  /**
   * Get trade statistics for the current user.
   *
   * FIX: the trade_statistics view uses RLS (auth.uid()) so it silently
   * returns nothing when the session is missing or expired. Added a direct
   * fallback query so the dashboard never shows zeros due to an auth hiccup.
   */
  async getTradeStats(): Promise<TradeStats | null> {
    try {
      // Primary: pre-built DB view (fast, computed in SQL)
      const { data, error } = await supabase
        .from('trade_statistics')
        .select('*')
        .single();

      if (!error && data) return data as TradeStats;

      // Fallback: compute directly from trades table
      console.warn('[TradesService] trade_statistics view failed, computing directly:', error?.message);

      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('pnl, status, entry_timestamp');

      if (tradesError || !trades) {
        console.error('[TradesService] Fallback query failed:', tradesError);
        return null;
      }

      const closed  = trades.filter(t => t.status === 'CLOSED');
      const open    = trades.filter(t => t.status === 'OPEN');
      const winners = closed.filter(t => (t.pnl || 0) > 0);
      const losers  = closed.filter(t => (t.pnl || 0) < 0);
      const netPnl  = closed.reduce((s, t) => s + (t.pnl || 0), 0);
      const sorted  = [...trades].sort(
        (a, b) => new Date(b.entry_timestamp).getTime() - new Date(a.entry_timestamp).getTime()
      );

      return {
        total_trades:      trades.length,
        closed_trades:     closed.length,
        open_trades:       open.length,
        winning_trades:    winners.length,
        losing_trades:     losers.length,
        win_rate:          closed.length > 0 ? (winners.length / closed.length) * 100 : 0,
        total_gains:       winners.reduce((s, t) => s + (t.pnl || 0), 0),
        total_losses:      losers.reduce((s, t) => s + (t.pnl || 0), 0),
        net_pnl:           netPnl,
        avg_winning_trade: winners.length > 0 ? winners.reduce((s, t) => s + (t.pnl || 0), 0) / winners.length : 0,
        avg_losing_trade:  losers.length  > 0 ? losers.reduce((s, t)  => s + (t.pnl || 0), 0) / losers.length  : 0,
        avg_trade_pnl:     closed.length  > 0 ? netPnl / closed.length : 0,
        last_trade_date:   sorted[0]?.entry_timestamp ?? null,
      };
    } catch (error) {
      console.error('[TradesService] Exception fetching trade stats:', error);
      return null;
    }
  }

  async getOpenTrades(): Promise<Trade[]> {
    return this.getTrades(100, 'OPEN');
  }

  async getClosedTrades(limit: number = 100): Promise<Trade[]> {
    return this.getTrades(limit, 'CLOSED');
  }

  async createTrade(
    trade: Omit<Trade, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<Trade | null> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        console.error('[TradesService] No authenticated user');
        return null;
      }

      const { data, error } = await supabase
        .from('trades')
        .insert([{ user_id: userData.user.id, ...trade }])
        .select()
        .single();

      if (error) {
        console.error('[TradesService] Error creating trade:', error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error('[TradesService] Exception creating trade:', error);
      return null;
    }
  }

  async updateTrade(tradeId: number, updates: Partial<Trade>): Promise<Trade | null> {
    try {
      const { data, error } = await supabase
        .from('trades')
        .update(updates)
        .eq('id', tradeId)
        .select()
        .single();

      if (error) {
        console.error('[TradesService] Error updating trade:', error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error('[TradesService] Exception updating trade:', error);
      return null;
    }
  }

  async closeTrade(tradeId: number, exitPrice: number): Promise<Trade | null> {
    try {
      const { data: trade, error: fetchError } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();

      if (fetchError || !trade) {
        console.error('[TradesService] Error fetching trade to close:', fetchError);
        return null;
      }

      const priceDiff      = exitPrice - trade.entry_price;
      const pnl            = trade.side === 'BUY'
        ? priceDiff * trade.quantity
        : -priceDiff * trade.quantity;
      const pnl_percentage = (pnl / (trade.entry_price * trade.quantity)) * 100;

      const { data: updatedTrade, error: updateError } = await supabase
        .from('trades')
        .update({
          exit_price:     exitPrice,
          exit_timestamp: new Date().toISOString(),
          status:         'CLOSED',
          pnl:            parseFloat(pnl.toFixed(2)),
          pnl_percentage: parseFloat(pnl_percentage.toFixed(2)),
        })
        .eq('id', tradeId)
        .select()
        .single();

      if (updateError) {
        console.error('[TradesService] Error closing trade:', updateError);
        return null;
      }

      return updatedTrade || null;
    } catch (error) {
      console.error('[TradesService] Exception closing trade:', error);
      return null;
    }
  }

  /**
   * Get performance metrics (used by dashboard top stat cards)
   */
  async getPerformanceMetrics() {
    try {
      const stats = await this.getTradeStats();
      if (!stats) {
        return {
          totalTrades: 0, winRate: 0, totalProfit: 0, totalLoss: 0,
          netPnL: 0, avgTradePnL: 0, openTrades: 0, closedTrades: 0,
          winningTrades: 0, losingTrades: 0, lastTradeDate: null,
        };
      }

      return {
        totalTrades:   stats.total_trades    || 0,
        winRate:       stats.win_rate        || 0,
        totalProfit:   stats.total_gains     || 0,
        totalLoss:     stats.total_losses    || 0,
        netPnL:        stats.net_pnl         || 0,
        avgTradePnL:   stats.avg_trade_pnl   || 0,
        openTrades:    stats.open_trades     || 0,
        closedTrades:  stats.closed_trades   || 0,
        winningTrades: stats.winning_trades  || 0,
        losingTrades:  stats.losing_trades   || 0,
        lastTradeDate: stats.last_trade_date,
      };
    } catch (error) {
      console.error('[TradesService] Exception getting performance metrics:', error);
      return null;
    }
  }

  /**
   * Get today's trades and calculate daily P&L
   */
  async getDailyPerformance() {
    try {
      const today    = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: todaysTrades, error } = await supabase
        .from('trades')
        .select('*')
        .gte('entry_timestamp', today.toISOString())
        .lt('entry_timestamp', tomorrow.toISOString())
        .order('entry_timestamp', { ascending: false });

      if (error) {
        console.error('[TradesService] Error fetching daily trades:', error);
        return {
          dailyTrades: 0, closedTodayTrades: 0, openTodayTrades: 0,
          dailyPnL: 0, dailyGains: 0, dailyLosses: 0,
          dailyWins: 0, dailyLosingTrades: 0, dailyWinRate: 0,
        };
      }

      const trades        = todaysTrades || [];
      const closedTrades  = trades.filter(t => t.status === 'CLOSED');
      const openTrades    = trades.filter(t => t.status === 'OPEN');

      const totalPnL      = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const gains         = closedTrades.filter(t => (t.pnl || 0) > 0).reduce((sum, t) => sum + (t.pnl || 0), 0);
      const losses        = closedTrades.filter(t => (t.pnl || 0) < 0).reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
      const winRate       = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

      return {
        dailyTrades:       trades.length,
        closedTodayTrades: closedTrades.length,
        openTodayTrades:   openTrades.length,
        dailyPnL:          totalPnL,
        dailyGains:        gains,
        dailyLosses:       losses,
        dailyWins:         winningTrades,
        dailyLosingTrades: closedTrades.length - winningTrades,
        dailyWinRate:      winRate,
        trades,
      };
    } catch (error) {
      console.error('[TradesService] Exception getting daily performance:', error);
      return null;
    }
  }

  /**
   * Get monthly P&L calendar for specified month.
   * Returns a Map of day-of-month → total closed P&L for that day.
   */
  async getMonthlyPnLCalendar(date?: Date): Promise<Map<number, number> | null> {
    try {
      const targetDate      = date || new Date();
      const year            = targetDate.getFullYear();
      const month           = targetDate.getMonth();
      const firstDayOfMonth = new Date(year, month, 1);
      const lastDayOfMonth  = new Date(year, month + 1, 0);

      const { data: trades, error } = await supabase
        .from('trades')
        .select('entry_timestamp, pnl, status')
        .gte('entry_timestamp', firstDayOfMonth.toISOString())
        .lte('entry_timestamp', lastDayOfMonth.toISOString())
        .eq('status', 'CLOSED');

      if (error) {
        console.error('[TradesService] Error querying monthly trades:', error);
        return null;
      }

      const dailyPnL = new Map<number, number>();

      trades?.forEach(trade => {
        const day        = new Date(trade.entry_timestamp).getDate();
        const currentPnL = dailyPnL.get(day) || 0;
        dailyPnL.set(day, currentPnL + (trade.pnl || 0));
      });

      return dailyPnL;
    } catch (error) {
      console.error('[TradesService] Exception getting monthly P&L calendar:', error);
      return null;
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
// ADD THESE TWO METHODS inside the TradesService class, just before the
// closing brace `}` of the class (before the singleton block at the bottom).
// ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch the current trading_enabled row.
   * Returns { isEnabled, disabledReason } or null on error.
   */
  async getTradingEnabled(): Promise<{ isEnabled: boolean; disabledReason: string | null } | null> {
    try {
      const { data, error } = await supabase
        .from('trading_enabled')
        .select('is_enabled, disabled_reason')
        .limit(1)
        .single();

      if (error) {
        console.error('[TradesService] Error fetching trading_enabled:', error);
        // Fail-safe: if we can't read the row, treat as DISABLED to be safe
        return { isEnabled: false, disabledReason: 'Could not verify trading status' };
      }

      return {
        isEnabled:      data.is_enabled,
        disabledReason: data.disabled_reason ?? null,
      };
    } catch (err) {
      console.error('[TradesService] Exception fetching trading_enabled:', err);
      return { isEnabled: false, disabledReason: 'Could not verify trading status' };
    }
  }

  /**
   * Set is_enabled = false on the trading_enabled row.
   * Can only be reversed from Supabase directly.
   *
   * @param reason  Optional human-readable reason stored in disabled_reason column.
   * @returns       { success, message }
   */
  async deactivateTrading(reason: string = 'Manually disabled from dashboard'): Promise<{ success: boolean; message: string }> {
    try {
      // Fetch the single row's id first (we don't know it client-side)
      const { data: row, error: fetchError } = await supabase
        .from('trading_enabled')
        .select('id')
        .limit(1)
        .single();

      if (fetchError || !row) {
        console.error('[TradesService] Could not find trading_enabled row:', fetchError);
        return { success: false, message: 'Could not find trading status record in database.' };
      }

      const { error: updateError } = await supabase
        .from('trading_enabled')
        .update({
          is_enabled:      false,
          disabled_reason: reason,
        })
        .eq('id', row.id);

      if (updateError) {
        console.error('[TradesService] Error deactivating trading:', updateError);
        return { success: false, message: `Failed to deactivate: ${updateError.message}` };
      }

      console.info('[TradesService] Trading deactivated. Reason:', reason);
      return { success: true, message: 'Trading has been deactivated for today.' };
    } catch (err) {
      console.error('[TradesService] Exception deactivating trading:', err);
      return { success: false, message: 'Unexpected error while deactivating trading.' };
    }
  }

}

// Singleton instance
let instance: TradesService | null = null;

export function getTradesService(): TradesService {
  if (!instance) instance = new TradesService();
  return instance;
}