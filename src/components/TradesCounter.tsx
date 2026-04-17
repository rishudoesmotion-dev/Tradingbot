'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Activity, CheckCircle2, ShoppingCart, DollarSign } from 'lucide-react';
import { useKotakTrading } from '@/hooks/useKotakTrading';

export default function TradesCounter() {
  const trading = useKotakTrading();
  const [count, setCount] = useState<TradeCount>({
    total: 0,
    buyCount: 0,
    sellCount: 0,
    maxAllowed: 3,
    canTrade: true,
    remaining: 3,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCount();
  }, [trading.orders]);

  const loadCount = async () => {
    try {
      const tradeCount = await tradeCounterService.getTodayTradeCountFromOrders(trading.orders);
      setCount(tradeCount);
    } catch (error) {
      console.error('[TradesCounter] Error loading count:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate percentage for color coding
  const percentage = (count.total / count.maxAllowed) * 100;
  
  // Color based on percentage
  let colorClass = 'text-green-600 bg-green-50 border-green-200';
  if (percentage >= 100) {
    colorClass = 'text-red-600 bg-red-50 border-red-200';
  } else if (percentage >= 60) {
    colorClass = 'text-yellow-600 bg-yellow-50 border-yellow-200';
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
        <Activity size={14} className="text-gray-400 animate-pulse" />
        <span className="text-xs text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-all ${colorClass}`}>
      <TrendingUp size={14} className="flex-shrink-0" />
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold tabular-nums">
          {count.total}/{count.maxAllowed}
        </span>
        <span className="text-xs font-medium">trades</span>
      </div>
      
      {count.total > 0 && (
        <div className="flex items-center gap-1.5 ml-1 pl-1.5 border-l border-current/20">
          {count.buyCount > 0 && (
            <span className="text-xs font-medium flex items-center gap-0.5" title="Completed BUY orders">
              <ShoppingCart size={10} />
              {count.buyCount}
            </span>
          )}
          {count.sellCount > 0 && (
            <span className="text-xs font-medium flex items-center gap-0.5" title="Completed SELL orders">
              <DollarSign size={10} />
              {count.sellCount}
            </span>
          )}
        </div>
      )}

      {!count.canTrade && (
        <span className="ml-1 text-xs font-bold">LIMIT REACHED</span>
      )}
    </div>
  );
}
