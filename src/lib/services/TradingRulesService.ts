// src/lib/services/TradingRulesService.ts
/**
 * Trading Rules Service
 * Manages all trading rules and configurations from Supabase
 * 
 * Features:
 * - Load rules from database
 * - Cache rules for performance
 * - Update rules dynamically
 * - Log rule violations
 * - Query allowed instruments
 */

import { supabase } from '@/lib/supabase/client';

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export interface TradesRulesConfig {
  niftyMaxLots: number;
  preventConcurrentTrades: boolean;
  maxTradesPerDay: number;
  allowedInstruments: string[];
}

export interface TradingRule {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  ruleType: 'ALLOWED_INSTRUMENTS' | 'CONCURRENT_TRADES' | 'NIFTY_LOT_LIMIT' | 'DAILY_TRADE_LIMIT';
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AllowedInstrument {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  instrumentType: string;
  isEnabled: boolean;
  minLotSize: number;
  maxLotSize: number;
}

export interface RuleViolation {
  id: string;
  orderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  ruleType: string;
  violationMessage: string;
  severity: 'ERROR' | 'WARNING';
  isBlocked: boolean;
  timestamp: string;
}

// ════════════════════════════════════════════════════════════════════════════
// TRADING RULES SERVICE
// ════════════════════════════════════════════════════════════════════════════

export class TradingRulesService {
  private static instance: TradingRulesService;
  private rulesCache: Map<string, TradingRule> = new Map();
  private instrumentsCache: AllowedInstrument[] = [];
  private configCache: TradesRulesConfig | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Private constructor for singleton pattern
  private constructor() {}

  // ═════════════════════════════════════════════════════════════════════════
  // SINGLETON PATTERN
  // ═════════════════════════════════════════════════════════════════════════

  static getInstance(): TradingRulesService {
    if (!TradingRulesService.instance) {
      TradingRulesService.instance = new TradingRulesService();
    }
    return TradingRulesService.instance;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // INITIALIZATION & CACHE MANAGEMENT
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Initialize service and load all rules from database
   */
  async initialize(): Promise<void> {
    try {
      console.log('[TradingRulesService] Initializing...');
      await Promise.all([
        this.loadRulesConfig(),
        this.loadAllRules(),
        this.loadAllowedInstruments(),
      ]);
      console.log('[TradingRulesService] ✅ Initialized successfully');
    } catch (error) {
      console.error('[TradingRulesService] ❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Clear cache and reload from database
   */
  async refreshCache(): Promise<void> {
    this.rulesCache.clear();
    this.instrumentsCache = [];
    this.configCache = null;
    this.cacheTimestamp = 0;
    await this.initialize();
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LOAD RULES FROM DATABASE
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Load rules configuration from database
   */
  private async loadRulesConfig(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('trading_config')
        .select('*')
        .single();

      if (error) throw error;

      if (data) {
        this.configCache = {
          niftyMaxLots: data.nifty_max_lots,
          preventConcurrentTrades: data.prevent_concurrent_trades,
          maxTradesPerDay: data.max_trades_per_day,
          allowedInstruments: data.allowed_instruments,
        };
      }

      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('[TradingRulesService] Failed to load rules config:', error);
      throw error;
    }
  }

  /**
   * Load all active trading rules
   */
  private async loadAllRules(): Promise<void> {
    try {
      // Rules are stored in trading_config table, not a separate trading_rules table
      // Load from trading_config which contains all rule configurations
      await this.loadRulesConfig();
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('[TradingRulesService] Failed to load rules:', error);
      // Non-critical - trading_rules table may not exist in all setups
      // The trading_config table is the source of truth for rules
    }
  }

  /**
   * Load all allowed instruments
   */
  private async loadAllowedInstruments(): Promise<void> {
    try {
      // Load allowed instruments from trading_config's allowed_instruments field
      if (this.configCache && this.configCache.allowedInstruments) {
        this.instrumentsCache = this.configCache.allowedInstruments.map((symbol: string) => ({
          id: symbol,
          symbol: symbol,
          name: symbol,
          exchange: 'NSE',
          instrumentType: 'OPTIONS',
          isEnabled: true,
          minLotSize: 1,
          maxLotSize: 1,
        }));
      }
      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error('[TradingRulesService] Failed to load instruments:', error);
      // Non-critical - use defaults from config
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // GET RULES & CONFIGURATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get all active trading rules
   */
  async getRules(): Promise<TradingRule[]> {
    if (!this.isCacheValid()) {
      await this.loadAllRules();
    }
    return Array.from(this.rulesCache.values());
  }

  /**
   * Get specific rule by ID
   */
  async getRule(ruleId: string): Promise<TradingRule | null> {
    if (!this.isCacheValid()) {
      await this.loadAllRules();
    }
    return this.rulesCache.get(ruleId) || null;
  }

  /**
   * Get rules configuration
   */
  async getConfig(): Promise<TradesRulesConfig> {
    if (!this.isCacheValid()) {
      await this.loadRulesConfig();
    }
    return (
      this.configCache || {
        niftyMaxLots: 1,
        preventConcurrentTrades: true,
        maxTradesPerDay: 3,
        allowedInstruments: ['NIFTY'],
      }
    );
  }

  /**
   * Check whether the master trading switch is ON.
   * Reads the single row from the `trading_enabled` table.
   * Returns { isEnabled, reason } where reason is set when trading is disabled.
   */
  async isTradingEnabled(): Promise<{ isEnabled: boolean; reason: string | null }> {
    try {
      const { data, error } = await supabase
        .from('trading_enabled')
        .select('is_enabled, disabled_reason')
        .single();

      if (error) throw error;

      return {
        isEnabled: data?.is_enabled ?? true,
        reason: data?.disabled_reason ?? null,
      };
    } catch (error) {
      console.error('[TradingRulesService] Failed to read trading_enabled:', error);
      // Fail open on DB error so a connectivity blip doesn't halt all trading
      return { isEnabled: true, reason: null };
    }
  }

  /**
   * Get allowed instruments
   */
  async getAllowedInstruments(): Promise<AllowedInstrument[]> {
    if (!this.isCacheValid()) {
      await this.loadAllowedInstruments();
    }
    return this.instrumentsCache;
  }

  /**
   * Check if instrument is allowed
   */
  async isInstrumentAllowed(symbol: string): Promise<boolean> {
    const instruments = await this.getAllowedInstruments();
    return instruments.some(
      (instrument) =>
        instrument.symbol.includes(symbol) && instrument.isEnabled
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // UPDATE RULES & CONFIGURATION
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Update rules configuration
   */
  async updateConfig(config: Partial<TradesRulesConfig>): Promise<void> {
    try {
      const { error } = await supabase
        .from('trading_config')
        .update({
          nifty_max_lots: config.niftyMaxLots,
          prevent_concurrent_trades: config.preventConcurrentTrades,
          max_trades_per_day: config.maxTradesPerDay,
          allowed_instruments: config.allowedInstruments,
        })
        .eq('id', (await this.getConfigId()) || '');

      if (error) throw error;

      // Refresh cache
      this.configCache = null;
      await this.loadRulesConfig();
      console.log('[TradingRulesService] ✅ Config updated');
    } catch (error) {
      console.error('[TradingRulesService] Failed to update config:', error);
      throw error;
    }
  }

  /**
   * Update individual trading rule
   */
  async updateRule(ruleId: string, updates: Partial<TradingRule>): Promise<void> {
    try {
      const { error } = await supabase
        .from('trading_rules')
        .update({
          name: updates.name,
          description: updates.description,
          is_active: updates.isActive,
          config: updates.config,
        })
        .eq('id', ruleId);

      if (error) throw error;

      // Update cache
      const cachedRule = this.rulesCache.get(ruleId);
      if (cachedRule) {
        this.rulesCache.set(ruleId, { ...cachedRule, ...updates });
      }

      console.log('[TradingRulesService] ✅ Rule updated:', ruleId);
    } catch (error) {
      console.error('[TradingRulesService] Failed to update rule:', error);
      throw error;
    }
  }

  /**
   * Add/enable allowed instrument
   */
  async addAllowedInstrument(instrument: AllowedInstrument): Promise<void> {
    try {
      const { error } = await supabase.from('allowed_instruments').insert({
        symbol: instrument.symbol,
        name: instrument.name,
        exchange: instrument.exchange,
        instrument_type: instrument.instrumentType,
        is_enabled: instrument.isEnabled,
        min_lot_size: instrument.minLotSize,
        max_lot_size: instrument.maxLotSize,
      });

      if (error) throw error;

      // Refresh instruments cache
      this.instrumentsCache = [];
      await this.loadAllowedInstruments();
      console.log('[TradingRulesService] ✅ Instrument added:', instrument.symbol);
    } catch (error) {
      console.error('[TradingRulesService] Failed to add instrument:', error);
      throw error;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LOGGING & VIOLATIONS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Log a rule violation
   */
  async logViolation(violation: Omit<RuleViolation, 'id' | 'createdAt'>): Promise<void> {
    try {
      const { error } = await supabase.from('rule_violations').insert({
        order_id: violation.orderId,
        symbol: violation.symbol,
        side: violation.side,
        quantity: violation.quantity,
        price: violation.price,
        rule_type: violation.ruleType,
        violation_message: violation.violationMessage,
        severity: violation.severity,
        is_blocked: violation.isBlocked,
        timestamp: violation.timestamp,
      });

      if (error) throw error;

      console.log('[TradingRulesService] 📝 Violation logged:', violation.ruleType);
    } catch (error) {
      console.error('[TradingRulesService] Failed to log violation:', error);
      // Don't throw - logging failures should not break trading
    }
  }

  /**
   * Get violations for today
   */
  async getTodayViolations(): Promise<RuleViolation[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('rule_violations')
        .select('*')
        .gte('timestamp', today)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      return (data || []).map((violation: any) => ({
        id: violation.id,
        orderId: violation.order_id,
        symbol: violation.symbol,
        side: violation.side,
        quantity: violation.quantity,
        price: violation.price,
        ruleType: violation.rule_type,
        violationMessage: violation.violation_message,
        severity: violation.severity,
        isBlocked: violation.is_blocked,
        timestamp: violation.timestamp,
      }));
    } catch (error) {
      console.error('[TradingRulesService] Failed to get violations:', error);
      return [];
    }
  }

  /**
   * Get violations by rule type
   */
  async getViolationsByType(ruleType: string): Promise<RuleViolation[]> {
    try {
      const { data, error } = await supabase
        .from('rule_violations')
        .select('*')
        .eq('rule_type', ruleType)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;

      return (data || []).map((violation: any) => ({
        id: violation.id,
        orderId: violation.order_id,
        symbol: violation.symbol,
        side: violation.side,
        quantity: violation.quantity,
        price: violation.price,
        ruleType: violation.rule_type,
        violationMessage: violation.violation_message,
        severity: violation.severity,
        isBlocked: violation.is_blocked,
        timestamp: violation.timestamp,
      }));
    } catch (error) {
      console.error('[TradingRulesService] Failed to get violations:', error);
      return [];
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Get config ID (assumes single row in table)
   */
  private async getConfigId(): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('trading_config')
        .select('id')
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('[TradingRulesService] Failed to get config ID:', error);
      return null;
    }
  }

  /**
   * Get summary of all rules
   */
  async getSummary(): Promise<string> {
    const config = await this.getConfig();
    const rules = await this.getRules();
    const instruments = await this.getAllowedInstruments();

    return `
Trading Rules Summary:
═════════════════════════════════════════════════════════════
Configuration:
  • NIFTY Max Lots: ${config.niftyMaxLots}
  • Prevent Concurrent Trades: ${config.preventConcurrentTrades}
  • Max Trades/Day: ${config.maxTradesPerDay}
  • Allowed Instruments: ${config.allowedInstruments.join(', ')}

Active Rules: ${rules.length}
${rules.map((r) => `  • ${r.name}`).join('\n')}

Allowed Instruments: ${instruments.length}
${instruments.map((i) => `  • ${i.symbol}: ${i.name}`).join('\n')}
═════════════════════════════════════════════════════════════
    `;
  }
}

// Export singleton instance
export const tradingRulesService = TradingRulesService.getInstance();
