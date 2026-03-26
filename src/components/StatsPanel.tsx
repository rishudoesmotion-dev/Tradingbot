'use client';

import { useTradingStore } from '@/store/tradingStore';
import { TrendingUp, TrendingDown, Wallet, Percent } from 'lucide-react';
import { ExpiryDisplay } from './ExpiryDisplay';

export default function StatsPanel() {
  const { positions, orders } = useTradingStore();

  // Calculate total P&L
  const totalPL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

  // Calculate average return percentage
  const avgReturn =
    positions.length > 0
      ? positions.reduce((sum, pos) => sum + (pos.pnlPercentage || 0), 0) /
        positions.length
      : 0;

  // Count open orders
  const openOrders = orders.filter((o) => o.status === 'PENDING').length;

  // Calculate total invested (buy price * quantity)
  const totalInvested = positions.reduce(
    (sum, pos) => sum + ((pos.buyPrice || 0) * (pos.quantity || 0)),
    0
  );

  // Calculate current value (LTP * quantity)
  const currentValue = positions.reduce(
    (sum, pos) => sum + ((pos.ltp || 0) * (pos.quantity || 0)),
    0
  );

  return (
    <div className="space-y-4">
      {/* Top Row - P&L Summary */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total P&L */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total P&L</p>
              <p
                className={`text-2xl font-bold ${
                  totalPL >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                ₹{Math.abs(totalPL).toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            {totalPL >= 0 ? (
              <TrendingUp
                size={32}
                className="text-green-600 opacity-50"
              />
            ) : (
              <TrendingDown
                size={32}
                className="text-red-600 opacity-50"
              />
            )}
          </div>
        </div>

        {/* Average Return */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Avg Return</p>
              <p
                className={`text-2xl font-bold ${
                  avgReturn >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {avgReturn.toFixed(2)}%
              </p>
            </div>
            <Percent size={32} className="text-blue-600 opacity-50" />
          </div>
        </div>
      </div>

      {/* Middle Row - Investment Details */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total Invested */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Invested</p>
              <p className="text-2xl font-bold text-gray-800">
                ₹{totalInvested.toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <Wallet size={32} className="text-purple-600 opacity-50" />
          </div>
        </div>

        {/* Current Value */}
        <div className="p-4 bg-white border border-gray-200 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Current Value</p>
              <p className="text-2xl font-bold text-gray-800">
                ₹{currentValue.toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <Wallet size={32} className="text-orange-600 opacity-50" />
          </div>
        </div>
      </div>

      {/* Bottom Row - Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        {/* Open Positions */}
        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow text-center">
          <p className="text-xs text-gray-600 font-medium">Open Positions</p>
          <p className="text-2xl font-bold text-blue-600">{positions.length}</p>
        </div>

        {/* Open Orders */}
        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow text-center">
          <p className="text-xs text-gray-600 font-medium">Pending Orders</p>
          <p className="text-2xl font-bold text-orange-600">{openOrders}</p>
        </div>

        {/* Total Orders */}
        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow text-center">
          <p className="text-xs text-gray-600 font-medium">Total Orders</p>
          <p className="text-2xl font-bold text-gray-700">{orders.length}</p>
        </div>
      </div>

      {/* Next Expiry Info */}
      <ExpiryDisplay />
    </div>
  );
}
