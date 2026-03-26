// src/lib/rules/TradesRulesEngine.ts (Updated to use TradingRulesService)
/**
 * Trades Rules Engine (v2)
 * 
 * Validates orders against all trading rules:
 * 1. Allowed instruments only
 * 2. Prevent concurrent live trades
 * 3. NIFTY lot limit (1 lot per day)
 * 4. Daily trade limit (3 trades per day)
 * 
 * Now backed by Supabase for centralized rule management
 */

import { supabase } from '@/lib/supabase/client';
import { OrderRequest, OrderStatus } from '@/types/broker.types';
import { tradingRulesService } from '@/lib/services/TradingRulesService';

export interface RulesValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TestContext {
  positions?: Map<string, any>;
  trades?: any[];
  mockConfig?: {
    niftyMaxLots?: number;
    preventConcurrentTrades?: boolean;
    maxTradesPerDay?: number;
    allowedInstruments?: string[];
  };
}

export interface ValidateOrderOptions {
  /**
   * Live positions from broker (optional)
   * If provided, these will be used instead of querying Supabase
   * Useful for real-time validation when UI has fresh data
   */
  livePositions?: any[];
  /**
   * Live orders from broker (optional)
   * Used to check for pending/open orders that haven't filled yet
   */
  liveOrders?: any[];
}

/**
 * Trades Rules Engine
 * Validates orders against configured trading rules
 */
export class TradesRulesEngine {
  private testContext?: TestContext;
  private livePositions?: any[];
  private liveOrders?: any[];

  /**
   * Set context for testing (optional)
   * Allows the engine to use in-memory data instead of querying Supabase
   */
  setTestContext(context: TestContext) {
    this.testContext = context;
  }

  /**
   * Clear test context
   */
  clearTestContext() {
    this.testContext = undefined;
  }

  /**
   * Set live positions from broker
   * These will be used instead of querying Supabase for concurrent trades check
   */
  setLivePositions(positions: any[]) {
    this.livePositions = positions;
  }

  /**
   * Set live orders from broker
   * These will be used to check for pending/open orders
   */
  setLiveOrders(orders: any[]) {
    this.liveOrders = orders;
  }

  /**
   * Main validation method
   * Checks order against all active rules
   */
  async validateOrder(orderRequest: OrderRequest, options?: ValidateOrderOptions): Promise<RulesValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Ensure service is initialized
      if (!tradingRulesService) {
        errors.push('Trading rules service not initialized');
        return { isValid: false, errors, warnings };
      }

      // Store live orders if provided
      if (options?.liveOrders) {
        this.setLiveOrders(options.liveOrders);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RULE -1: Check master trading switch (trading_enabled table)
      // ═══════════════════════════════════════════════════════════════════════
      const { isEnabled, reason } = await tradingRulesService.isTradingEnabled();
      if (!isEnabled) {
        const message = reason
          ? `Trading is currently disabled: ${reason}`
          : 'Trading is currently disabled by the master switch';
        errors.push(message);
        await this.logViolation({
          symbol: orderRequest.symbol,
          side: orderRequest.side.toString(),
          quantity: orderRequest.quantity,
          price: orderRequest.price,
          ruleType: 'TRADING_DISABLED',
          violationMessage: message,
          isBlocked: true,
        });
        // Hard stop — no point running further checks
        return { isValid: false, errors, warnings };
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RULE 0: Check allowed instruments
      // ═══════════════════════════════════════════════════════════════════════
      const instrumentError = await this.checkAllowedInstruments(orderRequest);
      if (instrumentError) {
        errors.push(instrumentError);
        await this.logViolation({
          symbol: orderRequest.symbol,
          side: orderRequest.side.toString(),
          quantity: orderRequest.quantity,
          price: orderRequest.price,
          ruleType: 'ALLOWED_INSTRUMENTS',
          violationMessage: instrumentError,
          isBlocked: true,
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RULE 1: Check for concurrent live trades
      // ═══════════════════════════════════════════════════════════════════════
      const config = await tradingRulesService.getConfig();
      if (config.preventConcurrentTrades) {
        const concurrentError = await this.checkConcurrentTrades(orderRequest);
        if (concurrentError) {
          errors.push(concurrentError);
          await this.logViolation({
            symbol: orderRequest.symbol,
            side: orderRequest.side.toString(),
            quantity: orderRequest.quantity,
            price: orderRequest.price,
            ruleType: 'CONCURRENT_TRADES',
            violationMessage: concurrentError,
            isBlocked: true,
          });
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RULE 2: Check NIFTY lot limit
      // ═══════════════════════════════════════════════════════════════════════
      const niftyError = await this.checkNiftyLotLimit(orderRequest);
      if (niftyError) {
        errors.push(niftyError);
        await this.logViolation({
          symbol: orderRequest.symbol,
          side: orderRequest.side.toString(),
          quantity: orderRequest.quantity,
          price: orderRequest.price,
          ruleType: 'NIFTY_LOT_LIMIT',
          violationMessage: niftyError,
          isBlocked: true,
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // RULE 3: Check daily trade limit
      // ═══════════════════════════════════════════════════════════════════════
      const dailyLimitError = await this.checkDailyTradeLimit();
      if (dailyLimitError) {
        errors.push(dailyLimitError);
        await this.logViolation({
          symbol: orderRequest.symbol,
          side: orderRequest.side.toString(),
          quantity: orderRequest.quantity,
          price: orderRequest.price,
          ruleType: 'DAILY_TRADE_LIMIT',
          violationMessage: dailyLimitError,
          isBlocked: true,
        });
      }
    } catch (error) {
      console.error('[TradesRulesEngine] Validation error:', error);
      errors.push('Failed to validate trading rules due to system error');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // RULE CHECKING METHODS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Rule 0: Check if instrument is in allowed list
   */
  private async checkAllowedInstruments(orderRequest: OrderRequest): Promise<string | null> {
    try {
      let allowedInstruments: string[] = [];

      // Use mock config if provided (for testing)
      if (this.testContext?.mockConfig?.allowedInstruments) {
        allowedInstruments = this.testContext.mockConfig.allowedInstruments;
      } else {
        // Load from database
        const config = await tradingRulesService.getConfig();
        allowedInstruments = config.allowedInstruments || [];
      }

      // Check if the symbol belongs to any allowed underlying
      const underlyingAllowed = allowedInstruments.some((allowedSymbol) =>
        orderRequest.symbol.startsWith(allowedSymbol)
      );

      if (!underlyingAllowed) {
        return `Instrument ${orderRequest.symbol} is not allowed for trading. Allowed underlyings: ${allowedInstruments.join(', ')}`;
      }

      // Only OPTIONS (CE / PE) are permitted — futures and spot are blocked.
      // NIFTY options look like: NIFTY2630225000PE or NIFTY25APR24500CE
      const isOption = orderRequest.symbol.endsWith('CE') || orderRequest.symbol.endsWith('PE');
      if (!isOption) {
        return `Only CE/PE options are allowed for trading. Received symbol "${orderRequest.symbol}" is not a recognised option contract`;
      }

      // Hard block: BANKNIFTY is explicitly not permitted regardless of DB config.
      if (orderRequest.symbol.toUpperCase().startsWith('BANKNIFTY')) {
        return `BANKNIFTY is not permitted for trading. Only NIFTY CE/PE options are allowed`;
      }

      return null;
    } catch (error) {
      console.error('[TradesRulesEngine] Allowed instruments check failed:', error);
      return null; // Don't block on system error
    }
  }

  /**
   * Rule 1: Check if there's already a live trade
   * A "live trade" means an open position OR a pending order in the market
   * SELL orders (closing an existing position) are always allowed.
   */
  private async checkConcurrentTrades(orderRequest: OrderRequest): Promise<string | null> {
    try {
      // SELL orders are exit orders — always let them through regardless of open positions
      if (orderRequest.side.toString().toUpperCase() === 'SELL') {
        console.log('[TradesRulesEngine] ✅ Concurrent trades check SKIPPED - SELL (exit) order for:', orderRequest.symbol);
        return null;
      }

      // Check for pending/open orders first (these take priority)
      if (this.liveOrders && this.liveOrders.length > 0) {
        const pendingOrders = this.liveOrders.filter((o) => {
          // Extract status from order - could be:
          // 1. status / ordStatus / ordSt (from our Order type or Kotak raw)
          // 2. PENDING / OPEN / COMPLETE / FILLED / REJECTED / CANCELLED / EXPIRED
          const status = (o.status || o.ordStatus || o.ordSt || '').toUpperCase();
          
          // Only count as pending if status is explicitly PENDING or OPEN
          // All other statuses mean the order is done (filled, rejected, cancelled, etc)
          return status === 'PENDING' || status === 'OPEN';
        });

        if (pendingOrders.length > 0) {
          const pendingSymbols = pendingOrders.map((o) => o.symbol || o.tsym || o.trdSym || '').filter(s => s);
          
          // If trying to place another order on the SAME symbol, allow it (averaging)
          if (pendingSymbols.length === 1 && pendingSymbols[0] === orderRequest.symbol) {
            console.log('[TradesRulesEngine] ⚠️ Pending order exists for same symbol:', orderRequest.symbol);
            console.log('[TradesRulesEngine] ℹ️ Allowing order - may be averaging existing order');
            return null;
          }

          console.log('[TradesRulesEngine] 🔴 Concurrent trades check FAILED - pending orders found:', pendingSymbols.join(', '));
          console.log('[TradesRulesEngine] Debug - All orders and their statuses:', this.liveOrders.map((o) => ({
            symbol: o.symbol || o.tsym || o.trdSym,
            status: o.status || o.ordStatus || o.ordSt,
          })));
          return `Cannot place new order while another is pending (Open orders: ${pendingSymbols.join(', ')})`;
        }
      }

      // Use test context if available
      if (this.testContext && this.testContext.positions) {
        if (this.testContext.positions.size > 0) {
          const openSymbols = Array.from(this.testContext.positions.keys()).join(', ');
          return `Cannot open new trade while another is active (Open: ${openSymbols})`;
        }
        return null;
      }

      // Use live positions from broker if provided (real-time check)
      if (this.livePositions && this.livePositions.length > 0) {
        const openPositions = this.livePositions.filter((p) => {
          // NET quantity is the only reliable indicator of an open position.
          // A closed position has netQty=0 even if buyQuantity/sellQuantity are both non-zero.
          // NEVER use buyQuantity as a fallback — a squared-off trade has buyQty=65 AND sellQty=65.
          const netQty = p.quantity ?? 0;
          return netQty !== 0; // open if net is non-zero (positive=long, negative=short)
        });

        console.log('[TradesRulesEngine] Position filter debug:', {
          totalPositions: this.livePositions.length,
          openPositions: openPositions.length,
          allPositions: this.livePositions.map((p) => ({
            symbol: p.symbol,
            netQty: p.quantity,   // NET qty — 0 means closed
            buyQty: p.buyQuantity,
            sellQty: p.sellQuantity,
            isOpen: (p.quantity ?? 0) !== 0,
          })),
        });

        if (openPositions.length > 0) {
          // Special case: if the only open position is the SAME symbol we're trying to trade,
          // it means we're likely trying to add to or close that position
          if (openPositions.length === 1 && openPositions[0].symbol === orderRequest.symbol) {
            console.log('[TradesRulesEngine] ⚠️ Position exists for same symbol:', orderRequest.symbol);
            console.log('[TradesRulesEngine] ℹ️ Allowing order - may be closing/adding to existing position');
            // Allow it - user might be closing/averaging the position
            return null;
          }

          const openSymbols = openPositions.map((p) => p.symbol).join(', ');
          console.log('[TradesRulesEngine] 🔴 Concurrent trades check FAILED - open positions found:', openSymbols);
          return `Cannot open new trade while another is active (Open: ${openSymbols})`;
        }

        console.log('[TradesRulesEngine] ✅ Concurrent trades check PASSED - no open positions (all have qty <= 0)');
        return null;
      }

      // Fallback: query Supabase (may be stale)
      console.log('[TradesRulesEngine] ⚠️ No live positions provided - querying Supabase (may be stale)');
      const { data: positions, error } = await supabase
        .from('positions')
        .select('*')
        .gt('quantity', 0); // Only count positions with open quantity

      if (error) {
        console.error('[TradesRulesEngine] Error querying positions from Supabase:', error);
        throw error;
      }

      // Filter out positions with zero or negative quantity (closed positions)
      const activePositions = (positions || []).filter((p) => {
        const qty = p.quantity || 0;
        return qty > 0;
      });

      if (activePositions.length > 0) {
        const openSymbols = activePositions.map((p) => p.symbol).join(', ');
        console.log('[TradesRulesEngine] 🔴 Concurrent trades check FAILED (DB) - open positions:', openSymbols);
        console.log('[TradesRulesEngine] Debug - All positions from DB:', (positions || []).map((p) => ({
          symbol: p.symbol,
          quantity: p.quantity,
        })));
        return `Cannot open new trade while another is active (Open: ${openSymbols})`;
      }

      console.log('[TradesRulesEngine] ✅ Concurrent trades check PASSED (DB) - no open positions');
      return null;
    } catch (error) {
      console.error('[TradesRulesEngine] Concurrent trades check failed:', error);
      return null; // Don't block on system error
    }
  }

  /**
   * Rule 2: Check NIFTY lot limit per order
   * Max 1 lot (65 quantity) per BUY order for NIFTY
   */
  private async checkNiftyLotLimit(orderRequest: OrderRequest): Promise<string | null> {
    try {
      const config = await tradingRulesService.getConfig();
      const maxNiftyLots = config.niftyMaxLots; // e.g., 1 lot

      // Check if this is a NIFTY trade
      const isNiftyTrade = orderRequest.symbol.includes('NIFTY');
      if (!isNiftyTrade) {
        return null; // Rule doesn't apply to non-NIFTY trades
      }

      // Only check BUY orders
      if (orderRequest.side.toString().toUpperCase() !== 'BUY') {
        return null; // SELL orders not limited
      }

      // Calculate lot size (65 units per lot)
      const LOT_SIZE = 65;
      const maxQuantityPerOrder = maxNiftyLots * LOT_SIZE; // e.g., 1 * 65 = 65

      // Check if order quantity exceeds limit
      if (orderRequest.quantity > maxQuantityPerOrder) {
        return `NIFTY BUY order quantity (${orderRequest.quantity}) exceeds limit (${maxQuantityPerOrder} units/${maxNiftyLots} lot)`;
      }

      return null;
    } catch (error) {
      console.error('[TradesRulesEngine] NIFTY lot limit check failed:', error);
      return null; // Don't block on system error
    }
  }

  /**
   * Rule 3: Check daily trade limit
   * Maximum trades allowed per calendar day
   * BUY + SELL of same symbol = 1 complete trade
   */
  private async checkDailyTradeLimit(): Promise<string | null> {
    try {
      const config = await tradingRulesService.getConfig();
      const maxTradesPerDay = config.maxTradesPerDay;

      // Use test context if available
      if (this.testContext && this.testContext.trades) {
        // Count unique symbol pairs (BUY + SELL = 1 trade)
        const tradePairs = new Set<string>();
        
        this.testContext.trades.forEach((trade) => {
          // Group by symbol - each symbol represents 1 trade
          tradePairs.add(trade.symbol);
        });

        if (tradePairs.size >= maxTradesPerDay) {
          return `Daily trade limit reached (${tradePairs.size}/${maxTradesPerDay} trades)`;
        }
        return null;
      }

      // Otherwise query Supabase
      const today = new Date().toISOString().split('T')[0];
      const { data: trades, error } = await supabase
        .from('trade_logs')
        .select('symbol')
        .gte('timestamp', today);

      if (error) throw error;

      // Count unique symbols (BUY + SELL of same symbol = 1 trade)
      const uniqueSymbols = new Set(trades?.map((t) => t.symbol) || []);

      if (uniqueSymbols.size >= maxTradesPerDay) {
        return `Daily trade limit reached (${uniqueSymbols.size}/${maxTradesPerDay} trades)`;
      }

      return null;
    } catch (error) {
      console.error('[TradesRulesEngine] Daily trade limit check failed:', error);
      return null; // Don't block on system error
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Log a rule violation to database
   */
  private async logViolation(violation: {
    symbol: string;
    side: string;
    quantity: number;
    price?: number;
    ruleType: string;
    violationMessage: string;
    isBlocked: boolean;
  }): Promise<void> {
    try {
      await tradingRulesService.logViolation({
        symbol: violation.symbol,
        side: violation.side as 'BUY' | 'SELL',
        quantity: violation.quantity,
        price: violation.price,
        ruleType: violation.ruleType,
        violationMessage: violation.violationMessage,
        severity: violation.isBlocked ? 'ERROR' : 'WARNING',
        isBlocked: violation.isBlocked,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[TradesRulesEngine] Failed to log violation:', error);
      // Don't throw - logging shouldn't break validation
    }
  }

  /**
   * Update trading rules configuration
   */
  async updateConfig(updates: {
    niftyMaxLots?: number;
    preventConcurrentTrades?: boolean;
    maxTradesPerDay?: number;
    allowedInstruments?: string[];
  }): Promise<void> {
    const config = await tradingRulesService.getConfig();
    await tradingRulesService.updateConfig({
      niftyMaxLots: updates.niftyMaxLots ?? config.niftyMaxLots,
      preventConcurrentTrades: updates.preventConcurrentTrades ?? config.preventConcurrentTrades,
      maxTradesPerDay: updates.maxTradesPerDay ?? config.maxTradesPerDay,
      allowedInstruments: updates.allowedInstruments ?? config.allowedInstruments,
    });
  }

  /**
   * Get current trading rules configuration
   */
  async getConfig() {
    return await tradingRulesService.getConfig();
  }

  /**
   * Get all allowed instruments
   */
  async getAllowedInstruments() {
    return await tradingRulesService.getAllowedInstruments();
  }

  /**
   * Get violations for today
   */
  async getTodayViolations() {
    return await tradingRulesService.getTodayViolations();
  }

  /**
   * Get summary of all rules
   */
  async getSummary() {
    return await tradingRulesService.getSummary();
  }
}

// Export singleton instance
export const tradesRulesEngine = new TradesRulesEngine();
