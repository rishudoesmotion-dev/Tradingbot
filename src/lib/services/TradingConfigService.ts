// src/lib/services/TradingConfigService.ts
/**
 * Trading Config Service
 * Fetches and caches trading_config from Supabase
 * Used to enforce lot restrictions and other trading limits
 */

import { supabase } from '@/lib/supabase/client';

export interface TradingConfig {
  nifty_max_lots: number;
  prevent_concurrent_trades: boolean;
  max_trades_per_day: number;
  allowed_instruments: string[];
}

class TradingConfigService {
  private static instance: TradingConfigService;
  private configCache: TradingConfig | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds cache

  private constructor() {}

  static getInstance(): TradingConfigService {
    if (!TradingConfigService.instance) {
      TradingConfigService.instance = new TradingConfigService();
    }
    return TradingConfigService.instance;
  }

  /**
   * Fetch trading config from Supabase
   * Uses cache if available and not stale
   */
  async getConfig(): Promise<TradingConfig> {
    // Return cached config if still valid
    if (this.configCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.configCache;
    }

    try {
      const { data, error } = await supabase
        .from('trading_config')
        .select('*')
        .single();

      if (error) {
        console.error('[TradingConfigService] Error fetching config:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No trading config found');
      }

      this.configCache = {
        nifty_max_lots: data.nifty_max_lots ?? 1,
        prevent_concurrent_trades: data.prevent_concurrent_trades ?? true,
        max_trades_per_day: data.max_trades_per_day ?? 3,
        allowed_instruments: data.allowed_instruments ?? ['NIFTY'],
      };
      this.cacheTimestamp = Date.now();

      return this.configCache;
    } catch (error) {
      console.error('[TradingConfigService] Failed to fetch config:', error);
      // Return safe defaults if fetch fails
      return {
        nifty_max_lots: 1,
        prevent_concurrent_trades: true,
        max_trades_per_day: 3,
        allowed_instruments: ['NIFTY'],
      };
    }
  }

  /**
   * Get max lots allowed for NIFTY
   */
  async getMaxLots(): Promise<number> {
    const config = await this.getConfig();
    return config.nifty_max_lots;
  }

  /**
   * Invalidate cache - useful after config updates
   */
  invalidateCache(): void {
    this.configCache = null;
    this.cacheTimestamp = 0;
  }
}

// Export singleton instance
export const tradingConfigService = TradingConfigService.getInstance();
