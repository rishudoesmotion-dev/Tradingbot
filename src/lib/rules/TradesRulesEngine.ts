// src/lib/rules/TradesRulesEngine.ts
import { supabase } from '@/lib/supabase/client';
import { OrderRequest, OrderStatus } from '@/types/broker.types';

export interface TradesRulesConfig {
  niftyMaxLots: number;
  preventConcurrentTrades: boolean;
  maxTradesPerDay: number;
  allowedInstruments: string[]; // e.g., ['NIFTY'] or ['NIFTY', 'BANKNIFTY']
}

export interface RulesValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Trades Rules Engine
 * Implements specific trading rules:
 * 1. Prevent multiple concurrent live trades
 * 2. Limit NIFTY trades to 1 lot
 * 3. Limit total trades per day to configured amount
 */
export class TradesRulesEngine {
  private config: TradesRulesConfig;

  constructor(config?: Partial<TradesRulesConfig>) {
    this.config = {
      niftyMaxLots: config?.niftyMaxLots ?? parseInt(process.env.NIFTY_MAX_LOTS || '1'),
      preventConcurrentTrades: config?.preventConcurrentTrades ?? (process.env.PREVENT_CONCURRENT_TRADES !== 'false'),
      maxTradesPerDay: config?.maxTradesPerDay ?? parseInt(process.env.MAX_TRADES_PER_DAY || '3'),
      allowedInstruments: config?.allowedInstruments ?? (process.env.ALLOWED_INSTRUMENTS || 'NIFTY').split(',').map(s => s.trim()),
    };
  }

  /**
   * Validate order against all trading rules
   */
  async validateOrder(orderRequest: OrderRequest): Promise<RulesValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Rule 0: Check allowed instruments
      const instrumentError = this.checkAllowedInstruments(orderRequest);
      if (instrumentError) {
        errors.push(instrumentError);
      }

      // Rule 1: Check for concurrent live trades
      if (this.config.preventConcurrentTrades) {
        const concurrentError = await this.checkConcurrentTrades();
        if (concurrentError) {
          errors.push(concurrentError);
        }
      }

      // Rule 2: Check NIFTY lot limit
      const niftyError = await this.checkNiftyLotLimit(orderRequest);
      if (niftyError) {
        errors.push(niftyError);
      }

      // Rule 3: Check daily trade limit
      const dailyLimitError = await this.checkDailyTradeLimit();
      if (dailyLimitError) {
        errors.push(dailyLimitError);
      }

    } catch (error) {
      console.error('Rules validation error:', error);
      errors.push('Failed to validate trading rules due to system error');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Rule 0: Check if instrument is in allowed list
   * Restricts trading to only configured instruments
   *
   * Returns error message if instrument not allowed, null otherwise
   */
  private checkAllowedInstruments(orderRequest: OrderRequest): string | null {
    // Extract base instrument name (e.g., "NIFTY" from "NIFTY-50")
    const baseSymbol = orderRequest.symbol.split('-')[0].toUpperCase();

    // Check if instrument is in allowed list
    const isAllowed = this.config.allowedInstruments.some(
      instrument => baseSymbol.includes(instrument) || instrument.includes(baseSymbol)
    );

    if (!isAllowed) {
      const allowed = this.config.allowedInstruments.join(', ');
      return `❌ Trading not allowed for ${baseSymbol}. Only allowed instruments: ${allowed}`;
    }

    return null;
  }

  /**
   * Rule 1: Check if there's already a live trade
   * Prevents opening a new trade while another is active
   *
   * A "live trade" means:
   * - An open position with non-zero quantity
   *
   * Returns error message if concurrent trade detected, null otherwise
   */
  private async checkConcurrentTrades(): Promise<string | null> {
    try {
      // Check for open positions (quantity > 0 means position is open)
      const { data: positions, error: posError } = await supabase
        .from('positions')
        .select('symbol, quantity')
        .gt('quantity', 0)
        .limit(1); // Just need to know if any exists

      if (posError) throw posError;

      if (positions && positions.length > 0) {
        const openPosSymbol = positions[0].symbol;
        const openQty = positions[0].quantity;
        return `❌ Cannot open new trade: Already have an open position in ${openPosSymbol} with ${openQty} qty`;
      }

      return null;
    } catch (error) {
      console.error('Error checking concurrent trades:', error);
      // On error, allow the trade to proceed (fail open)
      return null;
    }
  }

  /**
   * Rule 2: Check NIFTY lot limit
   * Only allows up to NIFTY_MAX_LOTS (default: 1) lot for NIFTY
   *
   * Returns error message if limit exceeded, null otherwise
   */
  private async checkNiftyLotLimit(orderRequest: OrderRequest): Promise<string | null> {
    try {
      // Check if this is a NIFTY instrument
      const isNifty = this.isNiftyInstrument(orderRequest.symbol);
      
      if (!isNifty) {
        return null; // Not a NIFTY order, rule doesn't apply
      }

      // Get NIFTY lot size from scrip master
      const lotSize = await this.getNiftyLotSize(orderRequest.symbol);
      const orderLots = Math.ceil(orderRequest.quantity / lotSize);

      // Check total NIFTY lots (including this order)
      const { data: niftyTrades, error } = await supabase
        .from('trade_logs')
        .select('*')
        .ilike('symbol', '%NIFTY%')
        .gte('timestamp', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()); // Today only

      if (error) throw error;

      // Count total NIFTY lots today
      const totalNiftyLots = niftyTrades?.reduce((sum, trade) => {
        return sum + Math.ceil(trade.quantity / lotSize);
      }, 0) ?? 0;

      const projectedTotalLots = totalNiftyLots + orderLots;

      if (projectedTotalLots > this.config.niftyMaxLots) {
        return `NIFTY lot limit exceeded: Trying to trade ${projectedTotalLots} lot(s), but only ${this.config.niftyMaxLots} lot(s) allowed per day`;
      }

      return null;
    } catch (error) {
      console.error('Error checking NIFTY lot limit:', error);
      // On error, allow the trade to proceed
      return null;
    }
  }

  /**
   * Rule 3: Check daily trade limit
   * Only allows up to maxTradesPerDay trades per calendar day
   *
   * A complete trade = 1 open + 1 close = counts as 1 trade
   * An open order that's not yet closed = counts as 1 trade
   *
   * Returns error message if limit exceeded, null otherwise
   */
  private async checkDailyTradeLimit(): Promise<string | null> {
    try {
      // Get today's trades
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: trades, error } = await supabase
        .from('trade_logs')
        .select('*')
        .gte('timestamp', today.toISOString());

      if (error) throw error;

      const totalTrades = trades?.length ?? 0;

      if (totalTrades >= this.config.maxTradesPerDay) {
        return `Daily trade limit reached: Already executed ${totalTrades} trade(s) out of ${this.config.maxTradesPerDay} allowed`;
      }

      // Warn if approaching limit
      if (totalTrades >= this.config.maxTradesPerDay * 0.8) {
        console.warn(`Approaching daily trade limit: ${totalTrades}/${this.config.maxTradesPerDay}`);
      }

      return null;
    } catch (error) {
      console.error('Error checking daily trade limit:', error);
      // On error, allow the trade to proceed
      return null;
    }
  }

  /**
   * Check if symbol is NIFTY-related
   */
  private isNiftyInstrument(symbol: string): boolean {
    return /NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY/i.test(symbol);
  }

  /**
   * Get lot size for NIFTY instrument from scrip master
   */
  private async getNiftyLotSize(symbol: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('scrip_master')
        .select('p_mtf_lot')
        .ilike('p_symbol', `%${symbol}%`)
        .limit(1)
        .single();

      if (error) {
        console.warn(`Could not find lot size for ${symbol}, using default 65`);
        return 65; // Default NIFTY lot size
      }

      return data?.p_mtf_lot ?? 65;
    } catch (error) {
      console.warn(`Error fetching lot size for ${symbol}, using default 65`);
      return 65; // Default lot size
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TradesRulesConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TradesRulesConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
