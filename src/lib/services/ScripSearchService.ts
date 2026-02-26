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
}

class ScripSearchService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  /**
   * Search for scrips by symbol name or trading symbol
   */
  async searchScrips(query: string, segment?: string): Promise<ScripResult[]> {
    if (!query || query.length < 1) {
      return [];
    }

    try {
      let dbQuery = this.supabase
        .from('scrip_master')
        .select('*')
        .or(`p_symbol.ilike.%${query}%,p_instr_name.ilike.%${query}%,p_trd_symbol.ilike.%${query}%`)
        .limit(20);

      // Filter by segment if provided
      if (segment) {
        dbQuery = dbQuery.eq('segment', segment);
      }

      const { data, error } = await dbQuery;

      if (error) {
        console.error('Scrip search error:', error);
        return [];
      }

      return data || [];
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
