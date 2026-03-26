'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Zap, BarChart3, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTradesService } from '@/lib/services/TradesService';

interface DashboardProps {
  isAuthenticated: boolean;
}

interface Stats {
  totalTrades: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  avgProfit: number;
  openTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  netPnL: number;
}

interface DailyStats {
  dailyTrades: number;
  closedTodayTrades: number;
  openTodayTrades: number;
  dailyPnL: number;
  dailyGains: number;
  dailyLosses: number;
  dailyWins: number;
  dailyLosingTrades: number;
  dailyWinRate: number;
}

export default function Dashboard({ isAuthenticated }: DashboardProps) {
  const [stats, setStats] = useState<Stats>({
    totalTrades: 0,
    winRate: 0,
    totalProfit: 0,
    totalLoss: 0,
    avgProfit: 0,
    openTrades: 0,
    closedTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    netPnL: 0,
  });

  const [dailyStats, setDailyStats] = useState<DailyStats>({
    dailyTrades: 0,
    closedTodayTrades: 0,
    openTodayTrades: 0,
    dailyPnL: 0,
    dailyGains: 0,
    dailyLosses: 0,
    dailyWins: 0,
    dailyLosingTrades: 0,
    dailyWinRate: 0,
  });

  const [monthlyPnL, setMonthlyPnL] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showDaily, setShowDaily] = useState(true); // Toggle: true = Today, false = Overall (excluding today)
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date()); // For month navigation

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const tradesService = getTradesService();

        // Get performance metrics from Supabase
        const metrics = await tradesService.getPerformanceMetrics();
        const daily = await tradesService.getDailyPerformance();

        if (metrics) {
          setStats({
            totalTrades: metrics.totalTrades || 0,
            winRate: metrics.winRate || 0,
            totalProfit: metrics.totalProfit || 0,
            totalLoss: metrics.totalLoss || 0,
            avgProfit: metrics.avgTradePnL || 0,
            openTrades: metrics.openTrades || 0,
            closedTrades: metrics.closedTrades || 0,
            winningTrades: metrics.winningTrades || 0,
            losingTrades: metrics.losingTrades || 0,
            netPnL: metrics.netPnL || 0,
          });
        }

        if (daily) {
          setDailyStats({
            dailyTrades: daily.dailyTrades || 0,
            closedTodayTrades: daily.closedTodayTrades || 0,
            openTodayTrades: daily.openTodayTrades || 0,
            dailyPnL: daily.dailyPnL || 0,
            dailyGains: daily.dailyGains || 0,
            dailyLosses: daily.dailyLosses || 0,
            dailyWins: daily.dailyWins || 0,
            dailyLosingTrades: daily.dailyLosingTrades || 0,
            dailyWinRate: daily.dailyWinRate || 0,
          });
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  // Separate useEffect for loading monthly data based on selectedMonth
  useEffect(() => {
    const loadMonthlyData = async () => {
      try {
        const tradesService = getTradesService();
        const monthly = await tradesService.getMonthlyPnLCalendar(selectedMonth);

        if (monthly) {
          setMonthlyPnL(monthly);
        }
      } catch (error) {
        console.error('Error loading monthly data:', error);
      }
    };

    if (isAuthenticated) {
      loadMonthlyData();
    }
  }, [selectedMonth, isAuthenticated]);

  const profitLossPercentage = stats.totalProfit > 0 
    ? ((stats.netPnL / stats.totalProfit) * 100) 
    : 0;

  // Helper function to get calendar days and weeks
  const getCalendarDays = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(startingDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      weeks.push(week);
    }

    return weeks;
  };

  const getColor = (day: number | null): string => {
    if (day === null) return 'bg-gray-50';
    
    const pnl = monthlyPnL.get(day) || 0;
    
    if (pnl > 0) {
      if (pnl >= 5000) return 'bg-green-600 text-white';
      if (pnl >= 2000) return 'bg-green-500 text-white';
      if (pnl >= 500) return 'bg-green-400 text-white';
      return 'bg-green-200 text-green-900';
    } else if (pnl < 0) {
      if (pnl <= -5000) return 'bg-red-600 text-white';
      if (pnl <= -2000) return 'bg-red-500 text-white';
      if (pnl <= -500) return 'bg-red-400 text-white';
      return 'bg-red-200 text-red-900';
    }
    
    return 'bg-gray-100 text-gray-700';
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const displayMonth = monthNames[selectedMonth.getMonth()];
  const displayYear = selectedMonth.getFullYear();
  const calendarWeeks = getCalendarDays();

  // Helper function to get metrics based on toggle
  const getMetrics = () => {
    if (showDaily) {
      return {
        totalTrades: dailyStats.dailyTrades,
        winRate: dailyStats.dailyWinRate,
        netPnL: dailyStats.dailyPnL,
        avgProfit: dailyStats.dailyGains > 0 ? dailyStats.dailyPnL / dailyStats.dailyTrades : 0,
        closedTrades: dailyStats.closedTodayTrades,
        openTrades: dailyStats.openTodayTrades,
        totalProfit: dailyStats.dailyGains,
        totalLoss: dailyStats.dailyLosses,
      };
    } else {
      return {
        totalTrades: stats.totalTrades,
        winRate: stats.winRate,
        netPnL: stats.netPnL,
        avgProfit: stats.avgProfit,
        closedTrades: stats.closedTrades,
        openTrades: stats.openTrades,
        totalProfit: stats.totalProfit,
        totalLoss: stats.totalLoss,
      };
    }
  };

  const displayMetrics = getMetrics();
  const displayProfitLossPercentage = displayMetrics.totalProfit > 0 
    ? ((displayMetrics.netPnL / displayMetrics.totalProfit) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Performance Metrics with Toggle */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Performance Metrics</h2>
          
          {/* Toggle Switch */}
          <div className="flex items-center gap-3 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setShowDaily(true)}
              className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                showDaily
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📅 Today
            </button>
            <button
              onClick={() => setShowDaily(false)}
              className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                !showDaily
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📊 Overall
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Trades */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Trades</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{displayMetrics.totalTrades}</p>
              </div>
              <div className="bg-blue-100 p-2 rounded-lg">
                <BarChart3 size={20} className="text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {displayMetrics.closedTrades} closed • {displayMetrics.openTrades} open
            </p>
          </div>

          {/* Win Rate */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Win Rate</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{displayMetrics.winRate.toFixed(1)}%</p>
              </div>
              <div className="bg-green-100 p-2 rounded-lg">
                <TrendingUp size={20} className="text-green-600" />
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${Math.min(displayMetrics.winRate, 100)}%` }}
              />
            </div>
          </div>

          {/* Net P&L */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Net P&L</p>
                <p className={`text-3xl font-bold mt-2 ${displayMetrics.netPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{displayMetrics.netPnL.toLocaleString('en-IN')}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${displayMetrics.netPnL >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                {displayMetrics.netPnL >= 0 ? (
                  <TrendingUp size={20} className="text-green-600" />
                ) : (
                  <TrendingDown size={20} className="text-red-600" />
                )}
              </div>
            </div>
            <p className={`text-xs mt-3 ${displayMetrics.netPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {displayMetrics.netPnL >= 0 ? '+' : ''}{displayProfitLossPercentage.toFixed(1)}% return
            </p>
          </div>

          {/* Avg Trade Profit */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Avg Trade P&L</p>
                <p className={`text-3xl font-bold mt-2 ${displayMetrics.avgProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                  ₹{displayMetrics.avgProfit.toFixed(0)}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${displayMetrics.avgProfit >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                <Zap size={20} className={displayMetrics.avgProfit >= 0 ? 'text-blue-600' : 'text-orange-600'} />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">Per trade average</p>
          </div>
        </div>
      </div>

      {/* Detailed Performance Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly P&L Calendar */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              📅 {displayMonth} {displayYear} Performance
            </h3>
            
            {/* Month Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const prev = new Date(selectedMonth);
                  prev.setMonth(prev.getMonth() - 1);
                  setSelectedMonth(prev);
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition"
                title="Previous month"
              >
                <ChevronLeft size={20} className="text-gray-600" />
              </button>
              
              <button
                onClick={() => setSelectedMonth(new Date())}
                className="px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="Go to current month"
              >
                Today
              </button>
              
              <button
                onClick={() => {
                  const next = new Date(selectedMonth);
                  next.setMonth(next.getMonth() + 1);
                  setSelectedMonth(next);
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition"
                title="Next month"
              >
                <ChevronRight size={20} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Calendar Legend */}
          <div className="mb-4 flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-600"></div>
              <span>+₹5000</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-400"></div>
              <span>+₹500</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gray-100"></div>
              <span>₹0</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-400"></div>
              <span>-₹500</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-600"></div>
              <span>-₹5000</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="space-y-2">
            {/* Week days header */}
            <div className="grid grid-cols-7 gap-1 mb-3">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-xs font-semibold text-gray-600 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            {calendarWeeks.map((week, weekIdx) => (
              <div key={weekIdx} className="grid grid-cols-7 gap-1">
                {week.map((day, dayIdx) => {
                  const pnl = day ? (monthlyPnL.get(day) || 0) : 0;
                  return (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      className={`p-3 rounded text-center text-sm font-medium cursor-pointer hover:shadow-md transition ${getColor(day)}`}
                      title={day ? `Day ${day}: ₹${pnl.toLocaleString('en-IN')}` : ''}
                    >
                      {day ? (
                        <div>
                          <div className="font-bold">{day}</div>
                          {pnl !== 0 && (
                            <div className="text-xs mt-1">
                              {pnl > 0 ? '+' : ''}₹{(Math.abs(pnl) / 1000).toFixed(1)}k
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-6 pt-4 border-t border-gray-200 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Profitable Days:</span>
              <span className="text-sm font-semibold text-green-600">
                {Array.from(monthlyPnL.values()).filter((p) => p > 0).length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Losing Days:</span>
              <span className="text-sm font-semibold text-red-600">
                {Array.from(monthlyPnL.values()).filter((p) => p < 0).length}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-900">Month Total P&L:</span>
              <span className={`text-sm font-bold ${Array.from(monthlyPnL.values()).reduce((a, b) => a + b, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{Array.from(monthlyPnL.values()).reduce((a, b) => a + b, 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Trade Statistics */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Trade Statistics</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <BarChart3 size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Winning Trades</p>
                  <p className="text-lg font-semibold text-blue-600">{stats.winningTrades}</p>
                </div>
              </div>
              {stats.totalTrades > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {((stats.winningTrades / stats.totalTrades) * 100).toFixed(0)}%
                </span>
              )}
            </div>

            <div className="h-px bg-gray-200" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <TrendingDown size={18} className="text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Losing Trades</p>
                  <p className="text-lg font-semibold text-orange-600">{stats.losingTrades}</p>
                </div>
              </div>
              {stats.totalTrades > 0 && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                  {((stats.losingTrades / stats.totalTrades) * 100).toFixed(0)}%
                </span>
              )}
            </div>

            <div className="h-px bg-gray-200" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Zap size={18} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Win / Loss Ratio</p>
                  <p className="text-lg font-semibold text-purple-600">
                    {stats.losingTrades > 0 ? (stats.winningTrades / stats.losingTrades).toFixed(2) : stats.winningTrades > 0 ? '∞' : '0'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600">Loading performance data...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && stats.totalTrades === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600 mb-3">No trades yet</p>
          <div className="inline-flex gap-2 text-sm text-gray-500">
            <span>📊</span> Start trading to see your performance metrics
          </div>
        </div>
      )}
    </div>
  );
}
