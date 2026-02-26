'use client';

import { useEffect, useState } from 'react';
import { Position } from '@/types/broker.types';
import { useTradingStore } from '@/store/tradingStore';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function PositionBook() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());

  const { positions: storePositions } = useTradingStore();

  useEffect(() => {
    setPositions(storePositions);
  }, [storePositions]);

  const handleSelectPosition = (symbol: string) => {
    setSelectedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  };

  const totalPNL = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalPNLPercent = positions.length > 0 
    ? (positions.reduce((sum, p) => sum + p.pnlPercentage, 0) / positions.length)
    : 0;

  if (positions.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 border border-gray-200 rounded-lg">
        <p>No open positions</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-gray-600">Total P&L</p>
          <p className={`text-xl font-bold ${totalPNL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ₹{totalPNL.toFixed(2)}
          </p>
        </div>
        <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
          <p className="text-sm text-gray-600">Average Return</p>
          <p className={`text-xl font-bold ${totalPNLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalPNLPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Positions Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPositions(new Set(positions.map(p => p.symbol)));
                    } else {
                      setSelectedPositions(new Set());
                    }
                  }}
                />
              </th>
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Avg Price</th>
              <th className="px-4 py-2 text-right">LTP</th>
              <th className="px-4 py-2 text-right">P&L</th>
              <th className="px-4 py-2 text-right">Return %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(position => (
              <tr key={position.symbol} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedPositions.has(position.symbol)}
                    onChange={() => handleSelectPosition(position.symbol)}
                  />
                </td>
                <td className="px-4 py-2 font-semibold">{position.symbol}</td>
                <td className="px-4 py-2 text-right">{position.quantity}</td>
                <td className="px-4 py-2 text-right">₹{position.buyPrice.toFixed(2)}</td>
                <td className="px-4 py-2 text-right font-semibold">₹{position.ltp.toFixed(2)}</td>
                <td className={`px-4 py-2 text-right font-semibold flex items-center justify-end gap-1 ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {position.pnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  ₹{position.pnl.toFixed(2)}
                </td>
                <td className={`px-4 py-2 text-right font-semibold ${position.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {position.pnlPercentage.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
