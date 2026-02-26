'use client';

import { useState } from 'react';
import { useKotakTrading } from '@/hooks/useKotakTrading';
import ScripSearchBox from './ScripSearchBox';
import { ScripResult } from '@/lib/services/ScripSearchService';
import { AlertCircle, Loader, TrendingUp, TrendingDown, Zap } from 'lucide-react';

export default function QuickTrade() {
  const trading = useKotakTrading();
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [ltp, setLtp] = useState(0);
  const [selectedScrip, setSelectedScrip] = useState<ScripResult | null>(null);

  const handleSelectScrip = (scrip: ScripResult) => {
    setSelectedScrip(scrip);
    setSymbol(scrip.p_symbol);
    console.log('📊 Selected scrip:', {
      symbol: scrip.p_symbol,
      trdSymbol: scrip.p_trd_symbol,
      exch: scrip.p_exch_seg,
      lot: scrip.l_lot_size,
    });
  };

  const handleBuy = async () => {
    if (!symbol.trim() || quantity <= 0) {
      return;
    }
    
    if (!selectedScrip) {
      alert('Please select a scrip from the search results');
      return;
    }

    // Use selected scrip data for trading
    await trading.buy({
      symbol: selectedScrip.p_symbol,
      quantity: Math.max(quantity, selectedScrip.l_lot_size), // Ensure quantity is at least 1 lot
      price: price > 0 ? price : undefined,
      productType: 'MIS', // Default to intraday
    });
  };

  const handleSell = async () => {
    if (!symbol.trim() || quantity <= 0) {
      return;
    }

    if (!selectedScrip) {
      alert('Please select a scrip from the search results');
      return;
    }

    // Use selected scrip data for trading
    await trading.sell({
      symbol: selectedScrip.p_symbol,
      quantity: Math.max(quantity, selectedScrip.l_lot_size),
      price: price > 0 ? price : undefined,
      productType: 'MIS',
    });
  };

  const handleGetLTP = async () => {
    if (!symbol.trim()) {
      return;
    }
    const ltpValue = await trading.getLTP(symbol.toUpperCase());
    setLtp(ltpValue);
  };

  return (
    <div className="w-full space-y-4">
      {/* Error Alert */}
      {trading.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{trading.error}</p>
        </div>
      )}

      {/* Trading Form */}
      {trading.isConnected && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold">Quick Trade</h3>

          {/* Stock Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search & Select Stock
            </label>
            <ScripSearchBox
              onSelect={handleSelectScrip}
              placeholder="Search by symbol (e.g., INFY, TCS, RELIANCE)..."
              defaultSegment="nse_cm"
            />
          </div>

          {/* Quantity and Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity {selectedScrip && `(Min: ${selectedScrip.l_lot_size})`}
            </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={trading.isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (Optional)
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                disabled={trading.isLoading}
                placeholder="0 = Market"
              />
            </div>
          </div>

          {/* Buy/Sell Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleBuy}
              disabled={trading.isLoading || !symbol.trim() || quantity <= 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition"
            >
              {trading.isLoading ? <Loader size={16} className="animate-spin" /> : <TrendingUp size={16} />}
              Buy
            </button>
            <button
              onClick={handleSell}
              disabled={trading.isLoading || !symbol.trim() || quantity <= 0}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition"
            >
              {trading.isLoading ? <Loader size={16} className="animate-spin" /> : <TrendingDown size={16} />}
              Sell
            </button>
          </div>

          {/* Kill Switch */}
          <button
            onClick={trading.killSwitch}
            disabled={trading.isLoading || trading.positions.length === 0}
            className="w-full px-4 py-2 bg-red-900 hover:bg-red-950 text-white rounded-md text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            <Zap size={16} />
            Kill Switch - Exit All
          </button>
        </div>
      )}

      {/* Positions and P&L */}
      {trading.isConnected && trading.positions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Positions</h3>
            <p
              className={`text-sm font-bold ${
                trading.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              Total P&L: ₹{trading.totalPnL.toLocaleString('en-IN', {
                maximumFractionDigits: 2,
              })}
            </p>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {trading.positions.map((position) => (
              <div
                key={position.symbol}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition"
              >
                <div>
                  <p className="font-medium text-sm">{position.symbol}</p>
                  <p className="text-xs text-gray-500">
                    {position.quantity} @ ₹{position.buyPrice.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-bold ${
                      position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    ₹{position.pnl.toLocaleString('en-IN', {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <button
                    onClick={() => trading.exitPosition(position.symbol)}
                    disabled={trading.isLoading}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"
                  >
                    Exit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {trading.isConnected && trading.positions.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-600">No open positions</p>
        </div>
      )}
    </div>
  );
}
