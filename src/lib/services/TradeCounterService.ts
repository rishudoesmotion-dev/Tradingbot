// src/lib/services/TradeCounterService.ts
/**
 * Trade Counter Service
 * Counts completed trades from orders and auto-disables trading at limit
 */

import { supabase } from '@/lib/supabase/client';
import { tradingConfigService } from './TradingConfigService';

export interface TradeCount {
  total: number;        // Total completed trade pairs (min of BUY and SELL)
  buyCount: number;     // Completed BUY orders today
  sellCount: number;    // Completed SELL orders today
  maxAllowed: number;   // Max trades per day from config
  canTrade: boolean;    // Whether more trades are allowed
  remaining: number;    // Trades remaining
}

class TradeCounterService {
  private static instance: TradeCounterService;

  private constructor() {}

  static getInstance(): TradeCounterService {
    if (!TradeCounterService.instance) {
      TradeCounterService.instance = new TradeCounterService();
    }
    return TradeCounterService.instance;
  }

  /**
   * Get today's date in YYYY-MM-DD format (IST)
   */
  private getTodayDateString(): string {
    const now = new Date();
    // Convert to IST (UTC + 5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    return istDate.toISOString().split('T')[0];
  }

  /**
   * Count completed trades from orders (passed from hook)
   */
  async getTodayTradeCountFromOrders(orders: any[]): Promise<TradeCount> {
    try {
      console.log('[TradeCounter] Checking orders...');
      console.log('[TradeCounter] Sample order:', orders[0]);
      
      // Since order dates are empty, just count ALL completed orders
      // (assumes the app/session is started fresh each day)
      const completedOrders = orders.filter(order => {
        const status = (order.status || order.ordSt || '').toLowerCase();
        return status.includes('complete');
      });

      console.log('[TradeCounter] Total completed orders:', completedOrders.length);

      // Count BUY and SELL separately
      const buyCount = completedOrders.filter(o => 
        (o.side || o.tranType || '').toUpperCase() === 'BUY'
      ).length;

      const sellCount = completedOrders.filter(o => 
        (o.side || o.tranType || '').toUpperCase() === 'SELL'
      ).length;

      console.log('[TradeCounter] BUY:', buyCount, 'SELL:', sellCount);

      // Total completed trade pairs = minimum of BUY and SELL
      const totalTrades = Math.min(buyCount, sellCount);

      // Get max allowed from config
      const config = await tradingConfigService.getConfig();
      const maxAllowed = config.max_trades_per_day;

      const tradeCount: TradeCount = {
        total: totalTrades,
        buyCount,
        sellCount,
        maxAllowed,
        canTrade: totalTrades < maxAllowed,
        remaining: Math.max(0, maxAllowed - totalTrades),
      };

      console.log('[TradeCounter] ✅ Final count:', tradeCount);

      // Auto-disable trading if limit reached
      if (buyCount >= maxAllowed && sellCount >= maxAllowed) {
        console.log('[TradeCounter] 🛑 Trade limit reached! Auto-disabling trading...');
        await this.autoDisableTrading(`Daily trade limit reached (${totalTrades}/${maxAllowed})`);
      }

      return tradeCount;
    } catch (error) {
      console.error('[TradeCounter] Error counting trades:', error);
      return this.getDefaultCount();
    }
  }

  /**
   * Auto-disable trading by setting is_enabled = false in DB (same as Deactivate button)
   */
  private async autoDisableTrading(reason: string): Promise<void> {
    try {
      console.log('[TradeCounter] 🛑 Auto-disabling trading:', reason);
      
      // Fetch the single row's id first
      const { data: row, error: fetchError } = await supabase
        .from('trading_enabled')
        .select('id')
        .limit(1)
        .single();

      if (fetchError || !row) {
        console.error('[TradeCounter] Could not find trading_enabled row:', fetchError);
        return;
      }

      // Update trading_enabled table (same as deactivate button does)
      const { error } = await supabase
        .from('trading_enabled')
        .update({
          is_enabled: false,
          disabled_reason: reason,
        })
        .eq('id', row.id);

      if (error) {
        console.error('[TradeCounter] ❌ DB update error:', JSON.stringify(error, null, 2));
      } else {
        console.log('[TradeCounter] ✅ Trading disabled successfully in DB!');
      }
    } catch (error) {
      console.error('[TradeCounter] ❌ Exception:', error);
    }
  }

  /**
   * Check if user can place a new BUY order
   */
  async canPlaceNewTrade(orders: any[]): Promise<{ allowed: boolean; reason?: string; count?: TradeCount }> {
    const count = await this.getTodayTradeCountFromOrders(orders);

    if (!count.canTrade) {
      return {
        allowed: false,
        reason: `Daily trade limit reached (${count.total}/${count.maxAllowed})`,
        count,
      };
    }

    return {
      allowed: true,
      count,
    };
  }

  /**
   * Get default count when service fails
   */
  private getDefaultCount(): TradeCount {
    return {
      total: 0,
      buyCount: 0,
      sellCount: 0,
      maxAllowed: 3,
      canTrade: true,
      remaining: 3,
    };
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    // No-op for now since we're reading directly from orders
  }
}

// Export singleton instance
export const tradeCounterService = TradeCounterService.getInstance();
