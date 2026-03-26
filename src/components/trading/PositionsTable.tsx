'use client';

import { TrendingUp, RefreshCw } from 'lucide-react';

interface Position {
  symbol: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  avgPrice?: number;
  ltp: number;
  pnl: number;
  pnlPercentage?: number;
  buyQuantity?: number;
  sellQuantity?: number;
  [key: string]: any;
}

interface PositionsTableProps {
  positions: Position[];
  isLoading: boolean;
  onExit: (symbol: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

/**
 * Parse a Kotak trdSym like "NIFTY2630224700PE" into display parts.
 * Returns: { underlying, strike, optType, expiry }
 * e.g. underlying="NIFTY", strike="24700", optType="PUT", expiry="02 MAR"
 */
function parseOptionSymbol(sym: string): {
  underlying: string;
  strike: string;
  optType: string;
  expiry: string;
} | null {
  // Format: NIFTY2630224900PE
  // Simple approach: extract everything before CE/PE, then grab last 4 digits as strike
  
  const ceOrPe = sym.match(/(CE|PE)$/i);
  if (!ceOrPe) {
    console.log('🔴 No CE/PE found in symbol:', sym);
    return null;
  }

  const optType = ceOrPe[1].toUpperCase();
  const withoutOptType = sym.substring(0, sym.length - 2);  // Remove CE or PE
  
  // Now extract: NIFTY + rest
  const m = withoutOptType.match(/^([A-Z]+)(.+)$/);
  if (!m) {
    console.log('🔴 Could not parse underlying from:', sym);
    return null;
  }

  const [, underlying, rest] = m;
  
  // The last 4 digits of 'rest' should be the strike
  // But strikes can be 24700, 24800, etc (5 digits)
  // So let's grab last 5 digits if available, else 4
  let strike = rest.slice(-4);  // Last 4 digits
  if (rest.length >= 9 && rest[rest.length - 5].match(/[2-3]/)) {
    // Looks like a 5-digit strike (starts with 2 or 3)
    strike = rest.slice(-5);
  }
  
  const dateCode = rest.substring(0, rest.length - strike.length);
  
  // If strike is 4 digits and starts with a number 4-9, it's likely missing the leading "2"
  // e.g., 4900 should be 24900
  let displayStrike = strike;
  if (strike.length === 4 && strike[0].match(/[4-9]/)) {
    displayStrike = '2' + strike;
    console.log(`  📊 Adjusted strike from ${strike} to ${displayStrike}`);
  }
  
  console.log(`✅ parseOptionSymbol: ${sym} → underlying=${underlying}, dateCode=${dateCode}, strike=${displayStrike}, optType=${optType}`);
  
  return {
    underlying: underlying.toUpperCase(),
    strike: displayStrike,
    optType: optType === 'PE' ? 'PUT' : 'CALL',
    expiry: dateCode,
  };
}

export default function PositionsTable({ positions, isLoading, onExit, onRefresh }: PositionsTableProps) {
  // Only open positions count toward P&L display and the badge count
  const openPositions = positions.filter(p => (p.quantity || 0) !== 0);
  const totalPnL = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const isProfit = totalPnL >= 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Positions</span>
          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{openPositions.length}</span>
          {positions.length > openPositions.length && (
            <span className="text-xs text-gray-400">+{positions.length - openPositions.length} closed</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {positions.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">P&L</span>
              <span className={`text-xs font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {isProfit ? '+' : ''}₹{totalPnL.toFixed(2)}
              </span>
            </div>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="text-gray-400 hover:text-blue-600 transition"
            title="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
            <TrendingUp size={24} className="opacity-20 mb-2" />
            <p className="text-sm">No open positions</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {positions.map((pos, i) => {
              const pnlPositive = (pos.pnl || 0) >= 0;
              const netQty = pos.quantity;
              const isOpen = netQty !== 0;
              const displayAvg = pos.avgPrice ?? (netQty >= 0 ? pos.buyPrice : pos.sellPrice);
              const productType = (pos.productType || pos.prdType || pos.prod || '').toString().toUpperCase();
              const exchange = (pos.exchange || pos.exSeg || 'NSE').toString().toUpperCase().replace('NSE_FO', 'NSE').replace('NSE_CM', 'NSE');

              // Parse option details for clean display
              const option = parseOptionSymbol(pos.symbol || '');

              return (
                <li
                  key={pos.symbol + '-' + productType + '-' + i}
                  className={`group px-3 py-3 hover:bg-gray-50 transition ${!isOpen ? 'opacity-50' : ''}`}
                >
                  {/* Row 1: shares count + product · P&L */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500">
                      <span className={netQty !== 0 ? 'text-gray-700' : 'text-gray-400'}>
                        {Math.abs(netQty)} SHARES
                      </span>
                      {' · '}
                      <span>{productType}</span>
                    </span>
                    <span className={`text-xs font-bold tabular-nums ${pnlPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {pnlPositive ? '+' : ''}₹{(pos.pnl || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Row 2: Instrument name (parsed) · LTP */}
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {option ? (
                        <>
                          <span className="text-xs font-bold text-gray-900">{option.underlying}</span>
                          <span className={`text-xs font-bold px-1 py-0 rounded ${option.optType === 'PUT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {option.strike} {option.optType === 'PUT' ? 'PUT' : 'CALL'}
                          </span>
                          <span className="text-xs text-gray-500 font-medium">{option.expiry}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-gray-900 truncate">{pos.symbol}</span>
                          <span className="text-xs text-gray-400 font-medium">(parse failed)</span>
                        </>
                      )}
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ml-2 ${pos.ltp > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                      LTP {pos.ltp > 0 ? pos.ltp.toFixed(2) : '—'}
                    </span>
                  </div>

                  {/* Row 3: Exchange · AVG · Exit button */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {exchange} · AVG {(displayAvg || 0).toFixed(2)}
                    </span>
                    {isOpen ? (
                      <button
                        onClick={() => onExit(pos.symbol)}
                        disabled={isLoading}
                        className="text-xs text-blue-500 hover:text-red-600 font-semibold transition opacity-0 group-hover:opacity-100 ml-2"
                      >
                        Exit
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Closed</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
