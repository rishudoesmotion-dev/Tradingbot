// src/lib/services/ScripSearchService.ts
/**
 * Scrip Search Service
 * 
 * Searches for instruments/stocks in the local database
 * Uses the synced scrip master data for fast lookups
 */

import { createClient } from '@supabase/supabase-js';

export interface ScripResult {
  id: number;
  p_symbol: string;
  p_exch_seg: string;
  p_trd_symbol: string;
  l_lot_size: number;
  p_instr_name: string;
  l_expiry_date?: number;
  segment: string;
  /** Instrument token (Kotak "tok" field) – required for Quotes API F&O lookups */
  p_tok?: string;
}

class ScripSearchService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  /**
   * Search for scrips by trading symbol or instrument name.
   * Uses DB-side ilike filtering for speed, then ranks on client.
   *
   * Strategy:
   *  - p_trd_symbol: CONTAINS search (%query%) — catches "NIFTY2630224700CE" when user types "NIFTY24700"
   *  - p_symbol:     STARTS-WITH search (query%) — keeps underlying searches (e.g. "RELIANCE") precise
   */
  async searchScrips(query: string, segment?: string): Promise<ScripResult[]> {
    if (!query || query.length < 1) return [];

    try {
      const cleanQuery = query.trim().toUpperCase();

      // trd_symbol uses CONTAINS so strike/expiry searches like "NIFTY24700" work;
      // p_symbol uses STARTS-WITH to keep equity searches noise-free.
      // For "nifty", also search p_symbol to catch NIFTY options
      let dbQuery = this.supabase
        .from('scrip_master')
        .select('*')
        .or(`p_trd_symbol.ilike.%${cleanQuery}%,p_symbol.ilike.%${cleanQuery}%`)
        .limit(100);

      if (segment) {
        dbQuery = dbQuery.eq('segment', segment);
      }

      const { data, error } = await dbQuery;

      if (error) {
        console.error('Scrip search error:', error);
        return [];
      }

      if (!data || data.length === 0) return [];

      // Rank results: exact > starts-with > contains
      const ranked = data
        .map(r => {
          const trd = (r.p_trd_symbol || '').toUpperCase();
          const sym = (r.p_symbol || '').toUpperCase();

          let score = 0;
          if (trd === cleanQuery)               score = 10000;
          else if (sym === cleanQuery)           score = 9000;
          else if (trd.startsWith(cleanQuery))   score = 5000 + Math.floor(1000 / Math.max(trd.length, 1));
          else if (sym.startsWith(cleanQuery))   score = 3000;
          else if (trd.includes(cleanQuery))     score = 1000 + Math.floor(1000 / Math.max(trd.length, 1));
          else if (sym.includes(cleanQuery))     score = 500;  // Added: p_symbol contains match

          return { r, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);

      return ranked.slice(0, 30).map(x => x.r);
    } catch (error) {
      console.error('Scrip search exception:', error);
      return [];
    }
  }

  /**
   * Get scrip by exact symbol
   */
  async getScripBySymbol(
    p_symbol: string,
    p_exch_seg: string
  ): Promise<ScripResult | null> {
    try {
      const { data, error } = await this.supabase
        .from('scrip_master')
        .select('*')
        .eq('p_symbol', p_symbol)
        .eq('p_exch_seg', p_exch_seg)
        .single();

      if (error) {
        console.error('Get scrip error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Get scrip exception:', error);
      return null;
    }
  }

  /**
   * Search for Nifty ATM ± range CE/PE options for the nearest expiry.
   * @param atmStrike  – current Nifty spot (rounded to nearest 50)
   * @param range      – how many points above/below ATM to include (default 200)
   */
  async searchNiftyAtmOptions(atmStrike: number, range = 200): Promise<ScripResult[]> {
    try {
      // Fetch all NIFTY F&O scrips
      const { data, error } = await this.supabase
        .from('scrip_master')
        .select('*')
        .eq('p_symbol', 'NIFTY')
        .eq('segment', 'nse_fo')
        .limit(5000);

      if (error || !data || data.length === 0) return [];

      // Parse strike and option type from p_trd_symbol
      // Format: NIFTY25JUN24900CE  or  NIFTY25JUN24900PE
      const optionRegex = /NIFTY\d{2}[A-Z]{3}(\d+)(CE|PE)$/i;

      interface Parsed extends ScripResult {
        strike: number;
        optType: 'CE' | 'PE';
      }

      const parsed: Parsed[] = [];
      for (const row of data) {
        const m = (row.p_trd_symbol || '').match(optionRegex);
        if (!m) continue;
        const strike = parseInt(m[1], 10);
        const optType = m[2].toUpperCase() as 'CE' | 'PE';
        parsed.push({ ...row, strike, optType });
      }

      if (parsed.length === 0) return [];

      // Find the nearest expiry date (smallest l_expiry_date ≥ today)
      const todayNum = parseInt(
        new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        10
      ); // e.g. 20250617

      const futureExpiries = parsed
        .map(p => p.l_expiry_date ?? 0)
        .filter(d => d >= todayNum);

      if (futureExpiries.length === 0) return [];
      const nearestExpiry = Math.min(...futureExpiries);

      // Round ATM to nearest 50
      const atm = Math.round(atmStrike / 50) * 50;
      const lo = atm - range;
      const hi = atm + range;

      const filtered = parsed
        .filter(p => (p.l_expiry_date ?? 0) === nearestExpiry)
        .filter(p => p.strike >= lo && p.strike <= hi);

      // Sort: by strike asc, then CE before PE
      filtered.sort((a, b) => {
        if (a.strike !== b.strike) return a.strike - b.strike;
        return a.optType === 'CE' ? -1 : 1;
      });

      return filtered;
    } catch (err) {
      console.error('searchNiftyAtmOptions error:', err);
      return [];
    }
  }

  /**
   * Get NIFTY options for a specific strike on the nearest expiry.
   * @param strike – strike price (e.g. 24800)
   * @returns Array with both CE and PE for that strike, sorted [CE, PE]
   */
  async getNiftyStrikeOptions(strike: number): Promise<ScripResult[]> {
    try {
      // Fetch all NIFTY F&O scrips
      const { data, error } = await this.supabase
        .from('scrip_master')
        .select('*')
        .eq('p_symbol', 'NIFTY')
        .eq('segment', 'nse_fo')
        .limit(5000);

      if (error || !data || data.length === 0) return [];

      // Parse strike and option type from p_trd_symbol
      const optionRegex = /NIFTY\d{2}[A-Z]{3}(\d+)(CE|PE)$/i;

      interface Parsed extends ScripResult {
        strikeNum: number;
        optType: 'CE' | 'PE';
      }

      const parsed: Parsed[] = [];
      for (const row of data) {
        const m = (row.p_trd_symbol || '').match(optionRegex);
        if (!m) continue;
        const strikeNum = parseInt(m[1], 10);
        const optType = m[2].toUpperCase() as 'CE' | 'PE';
        parsed.push({ ...row, strikeNum, optType });
      }

      if (parsed.length === 0) return [];

      // Find nearest expiry
      const todayNum = parseInt(
        new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        10
      );

      const futureExpiries = parsed
        .map(p => p.l_expiry_date ?? 0)
        .filter(d => d >= todayNum);

      if (futureExpiries.length === 0) return [];
      const nearestExpiry = Math.min(...futureExpiries);

      // Filter by strike and expiry
      const filtered = parsed
        .filter(p => p.strikeNum === strike)
        .filter(p => (p.l_expiry_date ?? 0) === nearestExpiry);

      // Sort: CE before PE
      filtered.sort((a, b) => (a.optType === 'CE' ? -1 : 1));

      return filtered;
    } catch (err) {
      console.error('getNiftyStrikeOptions error:', err);
      return [];
    }
  }

  /**
   * Get all available segments
   */
  async getSegments(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('scrip_master')
        .select('segment')
        .limit(1000);

      if (error) {
        console.error('Get segments error:', error);
        return [];
      }

      const segments = new Set<string>();
      if (data) {
        data.forEach(row => {
          if (row.segment) segments.add(row.segment);
        });
      }
      return Array.from(segments);
    } catch (error) {
      console.error('Get segments exception:', error);
      return [];
    }
  }

  /**
   * Check if scrip master is synced
   */
  async isSynced(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('scrip_master')
        .select('id', { count: 'exact', head: true });

      if (error) {
        console.error('Check synced error:', error);
        return false;
      }

      // If we have any records, it's synced
      return (data?.length ?? 0) > 0;
    } catch (error) {
      console.error('Check synced exception:', error);
      return false;
    }
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<Date | null> {
    try {
      const { data, error } = await this.supabase
        .from('scrip_sync_log')
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Get last sync time error:', error);
        return null;
      }

      return data ? new Date(data.synced_at) : null;
    } catch (error) {
      console.error('Get last sync time exception:', error);
      return null;
    }
  }
}

export const scripSearchService = new ScripSearchService();
