'use client';

import { useState, useEffect } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { getUpcomingExpiries, formatExpiryDate } from '@/lib/utils/expiryDates';

export function ExpiryDisplay() {
  const [expiryInfo, setExpiryInfo] = useState<{
    nextExpiry: { date: Date; type: string; daysAway: number } | null;
    upcomingWeekly: Array<{ date: Date; type: string; daysAway: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadExpiries = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        
        // Get upcoming expiries from F&O data
        const upcoming = await getUpcomingExpiries(5, supabaseUrl, supabaseKey);
        
        if (upcoming.length > 0) {
          const nextExp = upcoming[0];
          console.log('[ExpiryDisplay] 📅 Next expiry:', formatExpiryDate(nextExp.date), `(${nextExp.type}, ${nextExp.daysAway} days)`);
          console.log('[ExpiryDisplay] Upcoming expiries:', upcoming.map(e => formatExpiryDate(e.date)));
          
          setExpiryInfo({
            nextExpiry: nextExp,
            upcomingWeekly: upcoming.slice(0, 3),
          });
        } else {
          console.warn('[ExpiryDisplay] ⚠️ No expiry data available');
          setExpiryInfo({
            nextExpiry: null,
            upcomingWeekly: [],
          });
        }
      } catch (err) {
        console.error('[ExpiryDisplay] ❌ Error loading expiries:', err);
        setExpiryInfo({
          nextExpiry: null,
          upcomingWeekly: [],
        });
      } finally {
        setLoading(false);
      }
    };

    loadExpiries();
  }, []);

  if (!expiryInfo || !expiryInfo.nextExpiry) return null;

  const { nextExpiry, upcomingWeekly } = expiryInfo;

  return (
    <div className="flex flex-col gap-2 p-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
      {/* Next Expiry - Primary */}
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-purple-600" />
        <div className="flex-1">
          <div className="text-xs font-semibold text-gray-600">Next Expiry</div>
          <div className="text-sm font-bold text-gray-900">
            {formatExpiryDate(nextExpiry.date)}
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-200 text-purple-700">
              {nextExpiry.type}
            </span>
            <span className="ml-1 text-xs text-purple-600 font-medium">
              {nextExpiry.daysAway} day{nextExpiry.daysAway === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {/* Upcoming Weekly Expiries */}
      {upcomingWeekly.length > 1 && (
        <div className="text-xs text-gray-600 border-t border-purple-200 pt-2 mt-1">
          <div className="font-semibold mb-1">Upcoming:</div>
          <div className="space-y-1">
            {upcomingWeekly.slice(1).map((expiry, idx) => (
              <div key={idx} className="flex items-center gap-2 text-gray-700">
                <ChevronRight size={12} className="text-purple-400" />
                <span>{formatExpiryDate(expiry.date)} (+{expiry.daysAway} days)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version of expiry display (for headers/stats)
 */
export function ExpiryBadge() {
  const [expiryInfo, setExpiryInfo] = useState<{
    nextExpiry: { date: Date; type: string; daysAway: number } | null;
  } | null>(null);

  useEffect(() => {
    const loadExpiries = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        
        const upcoming = await getUpcomingExpiries(1, supabaseUrl, supabaseKey);
        if (upcoming.length > 0) {
          setExpiryInfo({ nextExpiry: upcoming[0] });
        }
      } catch (err) {
        console.error('[ExpiryBadge] Error:', err);
      }
    };

    loadExpiries();
  }, []);

  if (!expiryInfo || !expiryInfo.nextExpiry) return null;

  const { nextExpiry } = expiryInfo;

  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
      <Calendar size={12} />
      {nextExpiry.daysAway}d • {nextExpiry.type}
    </div>
  );
}
