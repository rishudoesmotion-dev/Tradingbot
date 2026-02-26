'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Zap, BarChart3, Clock, CheckCircle } from 'lucide-react';
import { getTradingDataService } from '@/lib/services/TradingDataService';

interface DashboardProps {
  isAuthenticated: boolean;
}

interface Stats {
  totalTrades: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  avgProfit: number;
  totalOrders: number;
  pendingOrders: number;
  executedOrders: number;
}

export default function Dashboard({ isAuthenticated }: DashboardProps) {
  const [stats, setStats] = useState<Stats>({
    totalTrades: 0,
    winRate: 0,
    totalProfit: 0,
    totalLoss: 0,
    avgProfit: 0,
    totalOrders: 0,
    pendingOrders: 0,
    executedOrders: 0,
  });

  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const dataService = getTradingDataService();

        // Get aggregated stats
        const aggregatedStats = await dataService.getAggregatedStats();

        // Get trade history
        const tradeHistory = await dataService.getTradeHistory();

        setStats({
          totalTrades: aggregatedStats.totalTrades,
          winRate: aggregatedStats.winRate,
          totalProfit: aggregatedStats.totalProfit,
          totalLoss: aggregatedStats.totalLoss,
          avgProfit: aggregatedStats.avgProfit,
          totalOrders: aggregatedStats.totalTrades,
          executedOrders: aggregatedStats.totalTrades,
          pendingOrders: 0,
        });

        setTrades(tradeHistory.slice(0, 10)); // Get last 10 trades
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const netProfit = stats.totalProfit + stats.totalLoss;
  const profitLossPercentage = ((netProfit / Math.abs(stats.totalProfit)) * 100) || 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Trades */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Trades</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalTrades}</p>
            </div>
            <div className="bg-blue-100 p-2 rounded-lg">
              <BarChart3 size={20} className="text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {stats.executedOrders} executed • {stats.pendingOrders} pending
          </p>
        </div>

        {/* Win Rate */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Win Rate</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.winRate}%</p>
            </div>
            <div className="bg-green-100 p-2 rounded-lg">
              <TrendingUp size={20} className="text-green-600" />
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${Math.min(stats.winRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Net P&L */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Net P&L</p>
              <p className={`text-3xl font-bold mt-2 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{netProfit.toLocaleString('en-IN')}
              </p>
            </div>
            <div className={`p-2 rounded-lg ${netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              {netProfit >= 0 ? (
                <TrendingUp size={20} className="text-green-600" />
              ) : (
                <TrendingDown size={20} className="text-red-600" />
              )}
            </div>
          </div>
          <p className={`text-xs mt-3 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {netProfit >= 0 ? '+' : ''}{profitLossPercentage.toFixed(1)}% return
          </p>
        </div>

        {/* Avg Trade Profit */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Avg Trade Profit</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">₹{stats.avgProfit.toFixed(0)}</p>
            </div>
            <div className="bg-blue-100 p-2 rounded-lg">
              <Zap size={20} className="text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">Per trade average</p>
        </div>
      </div>

      {/* Detailed Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit & Loss Breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Profit & Loss</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <TrendingUp size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Gains</p>
                  <p className="text-lg font-semibold text-green-600">₹{stats.totalProfit.toLocaleString('en-IN')}</p>
                </div>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">+{((stats.totalProfit / Math.abs(netProfit)) * 100 || 0).toFixed(1)}%</span>
            </div>

            <div className="h-px bg-gray-200" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-red-100 p-2 rounded-lg">
                  <TrendingDown size={18} className="text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Losses</p>
                  <p className="text-lg font-semibold text-red-600">₹{stats.totalLoss.toLocaleString('en-IN')}</p>
                </div>
              </div>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">{((stats.totalLoss / Math.abs(netProfit)) * 100 || 0).toFixed(1)}%</span>
            </div>

            <div className="h-px bg-gray-200" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Zap size={18} className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Net P&L</p>
                  <p className={`text-lg font-semibold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{netProfit.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${netProfit >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {netProfit >= 0 ? '+' : ''}{profitLossPercentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <BarChart3 size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Orders</p>
                  <p className="text-lg font-semibold text-gray-900">{stats.totalOrders}</p>
                </div>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">All Time</span>
            </div>

            <div className="h-px bg-gray-200" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <CheckCircle size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Executed</p>
                  <p className="text-lg font-semibold text-green-600">{stats.executedOrders}</p>
                </div>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                {((stats.executedOrders / stats.totalOrders) * 100).toFixed(0)}%
              </span>
            </div>

            <div className="h-px bg-gray-200" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-yellow-100 p-2 rounded-lg">
                  <Clock size={18} className="text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-lg font-semibold text-yellow-600">{stats.pendingOrders}</p>
                </div>
              </div>
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                {((stats.pendingOrders / stats.totalOrders) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
          {isAuthenticated && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Live Data</span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <p className="text-gray-600">Loading trade history...</p>
          </div>
        ) : trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Symbol</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Type</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Qty</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Price</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">P&L</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium text-gray-900">{trade.symbol}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          trade.side === 'BUY'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700">{trade.quantity}</td>
                    <td className="py-3 px-2 text-right text-gray-700">₹{trade.price.toFixed(2)}</td>
                    <td
                      className={`py-3 px-2 text-right font-semibold ${
                        trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl.toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-sm text-gray-500">
                      {new Date(trade.timestamp).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-gray-600 mb-3">No trades yet</p>
            <div className="inline-flex gap-2 text-sm text-gray-500">
              <span>📊</span> Start trading to see your orders here
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
