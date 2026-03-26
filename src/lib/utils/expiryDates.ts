/**
 * Calculate next options expiry dates by querying actual F&O NSE data
 * Instead of hardcoding holidays, we query the scrip_master to find real expiry dates
 * that NSE has already set (automatically accounting for holidays, weekends, etc.)
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Get unique expiry dates directly from F&O NSE data in scrip_master
 * This is the most accurate approach - NSE data already accounts for holidays/weekends
 */
export async function getExpiryDatesFromDatabase(
  supabaseUrl: string,
  supabaseKey: string
): Promise<Array<{ date: Date; count: number; daysAway: number }>> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Query all F&O scrips and get unique expiry dates
    const { data, error } = await supabase
      .from('scrip_master')
      .select('l_expiry_date')
      .like('p_exch_seg', '%_fo')
      .not('l_expiry_date', 'is', null)
      .order('l_expiry_date', { ascending: true });
    
    if (error) {
      console.error('❌ [getExpiryDatesFromDatabase] Error:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn('⚠️ [getExpiryDatesFromDatabase] No F&O data found');
      return [];
    }

    // Group by unique expiry dates and count contracts
    const expiryMap = new Map<number, { count: number }>();
    data.forEach((row: any) => {
      if (row.l_expiry_date) {
        const timestamp = row.l_expiry_date;
        if (!expiryMap.has(timestamp)) {
          expiryMap.set(timestamp, { count: 0 });
        }
        expiryMap.get(timestamp)!.count++;
      }
    });

    // Convert to array and calculate days away
    const today = new Date();
    const expiries = Array.from(expiryMap.entries())
      .map(([timestamp, entry]) => {
        const expiryDate = new Date(timestamp * 1000);
        const daysAway = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          date: expiryDate,
          count: entry.count,
          daysAway,
        };
      })
      .filter(exp => exp.daysAway >= 0) // Only future expiries
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    console.log(`✅ [getExpiryDatesFromDatabase] Found ${expiries.length} unique expiry dates from F&O data`);
    return expiries;
  } catch (err) {
    console.error('❌ [getExpiryDatesFromDatabase] Exception:', err);
    return [];
  }
}

/**
 * Get all upcoming expiry dates from F&O NSE data (database-driven, no hardcoded holidays)
 */
export async function getUpcomingExpiries(
  limit: number = 5,
  supabaseUrl?: string,
  supabaseKey?: string
): Promise<Array<{ date: Date; type: string; daysAway: number }>> {
  // Try to get from database first
  if (supabaseUrl && supabaseKey) {
    const dbExpiries = await getExpiryDatesFromDatabase(supabaseUrl, supabaseKey);
    if (dbExpiries.length > 0) {
      return dbExpiries.slice(0, limit).map(exp => ({
        date: exp.date,
        type: isMonthlyExpiry(exp.date) ? 'MONTHLY' : 'WEEKLY',
        daysAway: exp.daysAway,
      }));
    }
  }

  // Fallback: Calculate manually (for when DB not available)
  console.log('[getUpcomingExpiries] Using fallback calculation (DB not available)');
  return getUpcomingExpiriesFallback(limit);
}

/**
 * Fallback calculation (when database unavailable)
 * Uses manual Thursday calculation
 */
function getUpcomingExpiriesFallback(limit: number): Array<{ date: Date; type: string; daysAway: number }> {
  const expiries: Array<{ date: Date; type: string; daysAway: number }> = [];
  const today = new Date();
  
  let currentDate = new Date(today);
  for (let i = 0; i < limit; i++) {
    const thursday = getNextThursdayFallback(currentDate);
    const daysAway = Math.floor((thursday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    expiries.push({
      date: thursday,
      type: isMonthlyExpiry(thursday) ? 'MONTHLY' : 'WEEKLY',
      daysAway,
    });
    
    currentDate = new Date(thursday);
    currentDate.setDate(thursday.getDate() + 1);
  }
  
  return expiries;
}

/**
 * Fallback: Get next Thursday (simple calculation without DB)
 */
function getNextThursdayFallback(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  const day = date.getDay();
  const daysUntilThursday = (4 - day + 7) % 7;
  
  const nextThursday = new Date(date);
  nextThursday.setDate(date.getDate() + (daysUntilThursday || 7));
  nextThursday.setHours(15, 30, 0, 0);
  
  return nextThursday;
}

/**
 * Check if date is monthly expiry (last Thursday of month)
 */
function isMonthlyExpiry(date: Date): boolean {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + 7);
  return date.getMonth() !== nextDate.getMonth();
}

/**
 * Format expiry date for display
 * e.g., "02 MAR 2026" or "02 MAR 2026 (Weekly)"
 */
export function formatExpiryDate(date: Date): string {
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Get unique expiry dates from scrip master (database driven)
 * This queries actual expiries from the scrip_master table
 */
export async function getExpiryDatesFromDB(
  supabaseUrl: string,
  supabaseKey: string
): Promise<Array<{ date: Date; symbol: string; count: number }>> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get all F&O scrips with their expiry dates
    const { data, error } = await supabase
      .from('scrip_master')
      .select('l_expiry_date, p_trd_symbol, p_exch_seg')
      .like('p_exch_seg', '%_fo')
      .order('l_expiry_date', { ascending: true });
    
    if (error) {
      console.error('❌ Error fetching expiry dates from DB:', error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.warn('⚠️ No F&O scrips found in database');
      return [];
    }
    
    // Group by expiry date and count
    const expiryMap = new Map<number, { date: Date; count: number; symbols: Set<string> }>();
    
    data.forEach((row: any) => {
      if (row.l_expiry_date) {
        const expiryTime = row.l_expiry_date;
        if (!expiryMap.has(expiryTime)) {
          expiryMap.set(expiryTime, {
            date: new Date(expiryTime * 1000),
            count: 0,
            symbols: new Set(),
          });
        }
        const entry = expiryMap.get(expiryTime)!;
        entry.count++;
        entry.symbols.add(row.p_trd_symbol);
      }
    });
    
    // Convert to sorted array
    const expiries = Array.from(expiryMap.entries())
      .map(([_, entry]) => ({
        date: entry.date,
        symbol: Array.from(entry.symbols)[0] || 'UNKNOWN',
        count: entry.count,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    
    console.log(`✅ Found ${expiries.length} unique expiry dates in database`);
    return expiries;
  } catch (err) {
    console.error('❌ Exception in getExpiryDatesFromDB:', err);
    return [];
  }
}
