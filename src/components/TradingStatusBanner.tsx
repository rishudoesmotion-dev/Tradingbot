'use client';

import { useState, useEffect } from 'react';
import { tradingRulesService } from '@/lib/services/TradingRulesService';
import { AlertCircle, CheckCircle, Loader, Info } from 'lucide-react';

export default function TradingStatusBanner() {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [showRules, setShowRules] = useState(false);

  /**
   * Check trading status from database
   */
  const checkTradingStatus = async () => {
    try {
      setIsLoading(true);
      const { isEnabled: enabled, reason: disableReason } = 
        await tradingRulesService.isTradingEnabled();
      
      setIsEnabled(enabled);
      setReason(disableReason);
      setLastChecked(new Date());
    } catch (error) {
      console.error('[TradingStatusBanner] Failed to check trading status:', error);
      // On error, assume trading is disabled to be safe
      setIsEnabled(false);
      setReason('Unable to check trading status');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Check status on mount and set up polling
   */
  useEffect(() => {
    checkTradingStatus();

    // Poll every 10 seconds to catch DB updates
    const interval = setInterval(checkTradingStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  if (isLoading && isEnabled === null) {
    return (
      <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 flex items-center gap-2 animate-pulse">
        <Loader size={18} className="text-gray-500 animate-spin" />
        <span className="text-sm text-gray-600">Checking trading status...</span>
      </div>
    );
  }

  if (isEnabled) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
        <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-green-800">✅ Trading is ENABLED</p>
            
            {/* Info Icon with Rules Tooltip */}
            <div className="relative">
              <button
                onMouseEnter={() => setShowRules(true)}
                onMouseLeave={() => setShowRules(false)}
                onClick={() => setShowRules(!showRules)}
                className="p-0.5 hover:bg-green-100 rounded transition"
                title="View trading rules"
              >
                <Info size={16} className="text-green-600 hover:text-green-700 transition" />
              </button>
              
              {/* Tooltip */}
              {showRules && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-gray-900 text-white text-xs rounded-lg p-4 shadow-xl z-50">
                  <button
                    onClick={() => setShowRules(false)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                  <p className="font-semibold mb-2">📋 Trading Rules Active:</p>
                  <ul className="space-y-1.5 list-disc list-inside">
                    <li><span className="text-green-400">✓</span> Only NIFTY Options (CE/PE)</li>
                    <li><span className="text-green-400">✓</span> Max 1 lot per order</li>
                    <li><span className="text-green-400">✓</span> Max 3 trades per day</li>
                    <li><span className="text-green-400">✓</span> No concurrent live trades</li>
                  </ul>
                  <p className="text-gray-400 text-xs mt-3 pt-3 border-t border-gray-700">
                    Master switch (Rule -1) must be enabled to trade
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-green-700 mt-0.5">
            All trading operations are active. You can place orders.
          </p>
          {lastChecked && (
            <p className="text-xs text-green-600 mt-1">
              Last checked: {lastChecked.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={checkTradingStatus}
          disabled={isLoading}
          className="ml-auto px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium rounded transition disabled:opacity-50"
        >
          {isLoading ? 'Checking...' : 'Refresh'}
        </button>
      </div>
    );
  }

  // Trading is disabled
  return (
    <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4 flex items-start gap-3">
      <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-red-800">🚫 TRADING DISABLED</p>
          
          {/* Info Icon with Rules Tooltip */}
          <div className="relative">
            <button
              onMouseEnter={() => setShowRules(true)}
              onMouseLeave={() => setShowRules(false)}
              onClick={() => setShowRules(!showRules)}
              className="p-0.5 hover:bg-red-100 rounded transition"
              title="View trading rules"
            >
              <Info size={16} className="text-red-600 hover:text-red-700 transition" />
            </button>
            
            {/* Tooltip */}
            {showRules && (
              <div className="absolute left-0 top-full mt-2 w-72 bg-gray-900 text-white text-xs rounded-lg p-4 shadow-xl z-50">
                <button
                  onClick={() => setShowRules(false)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
                <p className="font-semibold mb-2">📋 Trading Rules Active:</p>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li><span className="text-green-400">✓</span> Only NIFTY Options (CE/PE)</li>
                  <li><span className="text-green-400">✓</span> Max 1 lot per order</li>
                  <li><span className="text-green-400">✓</span> Max 3 trades per day</li>
                  <li><span className="text-green-400">✓</span> No concurrent live trades</li>
                </ul>
                <p className="text-gray-400 text-xs mt-3 pt-3 border-t border-gray-700">
                  Master switch (Rule -1) must be enabled to trade
                </p>
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-red-700 mt-1">
          {reason || 'Trading is currently disabled. No orders can be placed.'}
        </p>
        {lastChecked && (
          <p className="text-xs text-red-600 mt-1.5">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        )}
      </div>
      <button
        onClick={checkTradingStatus}
        disabled={isLoading}
        className="ml-auto px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded transition disabled:opacity-50 flex-shrink-0"
      >
        {isLoading ? 'Checking...' : 'Retry'}
      </button>
    </div>
  );
}
