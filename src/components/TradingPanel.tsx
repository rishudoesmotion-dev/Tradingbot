'use client';

import { useKotakTrading } from '@/hooks/useKotakTrading';
import QuickTrade from './QuickTrade_v2';
import ResyncButton from './ResyncButton';
import ScripSearchBox from './ScripSearchBox';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';

interface TradingPanelProps {
  sessionInfo: any;
}

export default function TradingPanel({ sessionInfo }: TradingPanelProps) {
  const trading = useKotakTrading();

  /**
   * Connect to trading service with session info after authentication
   */
  useEffect(() => {
    if (sessionInfo && !trading.isConnected) {
      console.log('🔗 TradingPanel: User authenticated, connecting with session...');
      trading.connectWithSession(sessionInfo);
    }
  }, [sessionInfo, trading.isConnected]);

  const handleWatchlistSelect = (scrip: any) => {
    console.log('📊 Selected from watchlist:', scrip);
    // This handler is called when user clicks on a watchlist item
    // You can extend this to auto-fill the trading form or perform other actions
  };

  return (
    <div className="space-y-4">
      {/* Resync Button */}
      <ResyncButton />

      {/* Status Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                trading.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {trading.isConnected ? '✅ Connected to Kotak Neo' : '❌ Disconnected'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Balance: ₹{trading.balance.toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
          <button
            onClick={() => (trading.isConnected ? trading.disconnect() : trading.connect())}
            disabled={trading.isLoading}
            className={`px-3 py-1.5 rounded text-sm font-medium transition ${
              trading.isConnected
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            } disabled:opacity-50`}
          >
            {trading.isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Scrip Search Box with Watchlist */}
      <ScripSearchBox onSelect={handleWatchlistSelect} />

      {/* Error Alert */}
      {trading.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{trading.error}</p>
        </div>
      )}

      {/* Main Trading Panel */}
      <QuickTrade />
    </div>
  );
}
