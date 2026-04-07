// src/hooks/useKotakTrading.ts
import { useState, useEffect } from 'react';
import { kotakTradingService } from '@/lib/services/KotakTradingService';
import { Order, Position, OrderStatus, OrderSide } from '@/types/broker.types';
import { ProductType } from '@/types/broker.types';

export interface UseTradingState {
  isConnected: boolean;
  isLoading: boolean;
  balance: number;
  positions: Position[];
  orders: Order[];
  error: string | null;
  totalPnL: number;
  sessionExpired: boolean;
}

export interface UseTradingActions {
  connect: () => Promise<void>;
  connectWithSession: (sessionInfo: any) => Promise<void>;
  disconnect: () => Promise<void>;
  buy: (config: any) => Promise<void>;
  sell: (config: any) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  modifyOrder: (orderId: string, newPrice: number, quantity: number) => Promise<void>;
  exitPosition: (symbol: string) => Promise<void>;
  refreshData: () => Promise<void>;
  getLTP: (symbol: string) => Promise<number>;
  /** Directly update a position's LTP in state (no API call) — used by WebSocket feed */
  updatePositionLTP: (symbol: string, ltp: number) => void;
}

export function useKotakTrading(): UseTradingState & UseTradingActions {
  const [state, setState] = useState<UseTradingState>({
    isConnected: false,
    isLoading: false,
    balance: 0,
    positions: [],
    orders: [],
    error: null,
    totalPnL: 0,
    sessionExpired: false,
  });

  /**
   * Connect to Kotak Neo
   */
  const connect = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const success = await kotakTradingService.initialize();
      if (success) {
        await refreshData();
        setState(prev => ({ ...prev, isConnected: true }));
      } else {
        setState(prev => ({ ...prev, error: 'Failed to connect to Kotak Neo' }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Connect with existing session info (after authentication)
   */
  const connectWithSession = async (sessionInfo: any) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const success = await kotakTradingService.initializeWithSession(sessionInfo);
      if (success) {
        await refreshData();
        setState(prev => ({ ...prev, isConnected: true }));
      } else {
        setState(prev => ({ ...prev, error: 'Failed to initialize session' }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Session initialization failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Disconnect from Kotak Neo
   */
  const disconnect = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await kotakTradingService.disconnect();
      setState(prev => ({
        ...prev,
        isConnected: false,
        balance: 0,
        positions: [],
        orders: [],
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Disconnection failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Buy order
   */
  const buy = async (config: any) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await kotakTradingService.buy(config);

      if (result.success) {
        await refreshData();
      } else {
        setState(prev => ({ ...prev, error: result.message }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Buy order failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Sell order
   */
  const sell = async (config: any) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await kotakTradingService.sell(config);

      if (result.success) {
        await refreshData();
      } else {
        setState(prev => ({ ...prev, error: result.message }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Sell order failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Cancel order
   */
  const cancelOrder = async (orderId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      if (!orderId) throw new Error('No order ID provided');
      const result = await kotakTradingService.cancelOrder(orderId);
      if (result.success) {
        await refreshData();
      } else {
        setState(prev => ({ ...prev, error: result.message }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Order cancellation failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Modify order price / quantity
   */
  const modifyOrder = async (orderId: string, newPrice: number, quantity: number) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      if (!orderId) throw new Error('No order ID provided');
      const result = await kotakTradingService.modifyOrder(orderId, newPrice, quantity);
      if (result.success) {
        await refreshData();
      } else {
        setState(prev => ({ ...prev, error: result.message }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Order modification failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Exit position
   */
  const exitPosition = async (symbol: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await kotakTradingService.exitPosition(symbol);

      if (result.success) {
        await refreshData();
      } else {
        setState(prev => ({ ...prev, error: result.message }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Position exit failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Refresh all data
   */
  const refreshData = async () => {
    console.log('[useKotakTrading] 🔄 Refreshing data...');
    try {
      const [balanceRes, positionsRes, ordersRes] = await Promise.all([
        kotakTradingService.getBalance(),
        kotakTradingService.getPositions(),
        kotakTradingService.getOrders(),
      ]);

      console.log('[useKotakTrading] 📊 Refresh results:', {
        balance: balanceRes.success ? balanceRes.balance : 'ERROR',
        positions: positionsRes.success ? positionsRes.count : 'ERROR: ' + positionsRes.message,
        orders: ordersRes.success ? ordersRes.count : 'ERROR: ' + ordersRes.message,
      });

      if (!positionsRes.success || !ordersRes.success) {
        console.warn('[useKotakTrading] ⚠️ Some refresh calls failed:', {
          positionsMsg: positionsRes.message,
          ordersMsg: ordersRes.message,
        });
      }

      // Map raw Kotak position objects to our Position interface
      // Kotak fields: trdSym, sym, qty, buyAmt, sellAmt, prod, exSeg, flBuyQty, flSellQty
      // qty = NET quantity from Kotak (positive=long, negative=short, 0=squared off)
      const mapKotakPosition = (raw: any): Position & { pSymbol: string; quoteSymbol: string; tok: string; rawBuyAmt: number; rawSellAmt: number } => {
        const buyQty  = parseInt(raw.flBuyQty  || raw.brdLtQty || '0', 10);
        const sellQty = parseInt(raw.flSellQty || raw.srdLtQty || '0', 10);
        // Compute net qty ourselves from filled buy/sell — more reliable than raw.qty
        // raw.qty can be 0 even when position is open if Kotak returns day net including cf
        const computedNetQty = buyQty - sellQty;
        const kotakNetQty = parseInt(raw.qty || '0', 10);
        // Use computed if both agree; if they disagree, prefer the computed (from fills)
        const netQty = computedNetQty !== 0 ? computedNetQty : kotakNetQty;

        // Preserve raw amounts exactly — never recompute from avg to avoid rounding drift
        const rawBuyAmt  = parseFloat(raw.buyAmt  || '0');
        const rawSellAmt = parseFloat(raw.sellAmt || '0');

        const avgBuyPrice  = buyQty  > 0 ? rawBuyAmt  / buyQty  : 0;
        const avgSellPrice = sellQty > 0 ? rawSellAmt / sellQty : 0;

        // Net average price for display in AVG column
        // Long position (netQty > 0): show avg buy price
        // Short position (netQty < 0): show avg sell price
        // Squared off (netQty = 0): show avg buy price (reference)
        const avgPrice = netQty > 0 ? avgBuyPrice : netQty < 0 ? avgSellPrice : avgBuyPrice;

        // Kotak may return LTP directly on position object
        const kotakLtp = parseFloat(raw.ltp || raw.ltP || raw.c || '0');
        const ltp = kotakLtp > 0 ? kotakLtp : 0;

        // P&L formula (correct for all cases):
        //   realised component = sellAmt - buyAmt  (closed legs)
        //   unrealised component = netQty * ltp    (open legs marked to market)
        // Works for: long, short, partially closed, fully squared-off (netQty=0 → unrealised=0)
        const pnl = (rawSellAmt - rawBuyAmt) + (netQty * ltp);
        const invested = rawBuyAmt > 0 ? rawBuyAmt : (Math.abs(netQty) * avgBuyPrice);
        const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

        // trdSym is what Kotak uses internally (e.g. "NIFTY2630224900PE")
        // sym / p_symbol is the underlying pSymbol (e.g. "NIFTY")
        // tok is the instrument token Kotak requires for the Quotes neosymbol API (e.g. "54883")
        // For F&O: Quotes API needs nse_fo|<tok>; for equities: nse_cm|<pSymbol>
        const trdSym = raw.trdSym || raw.sym || raw.ts || '';
        const pSymbol = raw.sym || raw.p_symbol || trdSym;
        const tok = raw.tok || raw.token || '';
        const exchange = raw.exSeg || 'nse_cm';
        const isFnO = exchange.toLowerCase().includes('fo');
        // quoteSymbol = what we send to Kotak Quotes API and use as LTP map key
        // For F&O: use token number (e.g. "54883"); for equities: use pSymbol (e.g. "AXISBANK")
        const quoteSymbol = isFnO ? (tok || trdSym) : pSymbol;

        console.log(`[mapKotakPosition] ${trdSym}: buyQty=${buyQty} sellQty=${sellQty} kotakQty=${kotakNetQty} → netQty=${netQty} | buyAmt=${rawBuyAmt} sellAmt=${rawSellAmt} ltp=${ltp}`);

        return {
          symbol: trdSym,
          pSymbol,
          quoteSymbol,
          tok,
          exchange,
          productType: raw.prod as any || 'CNC',
          quantity: netQty,
          buyQuantity: buyQty,
          sellQuantity: sellQty,
          buyPrice: avgBuyPrice,
          sellPrice: avgSellPrice,
          avgPrice,
          rawBuyAmt,
          rawSellAmt,
          ltp,
          pnl: parseFloat(pnl.toFixed(2)),
          pnlPercentage: parseFloat(pnlPct.toFixed(2)),
        };
      };

      const rawPositions: any[] = positionsRes.positions || [];
      const mappedPositions: Position[] = rawPositions.map(mapKotakPosition);
      console.log('[useKotakTrading] 📍 Mapped positions:', mappedPositions);

      // Map raw Kotak order objects to our Order interface
      // Kotak fields: nOrdNo, trdSym, trnsTp (B/S), prcTp (L/MKT), qty, avgPrc, prc, prod, ordSt, vldt, ordDtTm
      const mapKotakOrder = (raw: any): Order => {
        const orderId = raw.nOrdNo || raw.orderId || '';
        const symbol = (raw.trdSym || raw.sym || raw.ts || '').replace(/-EQ|-FUT|-OPT/, ''); // Remove suffix
        const side = (raw.trnsTp || raw.tt) === 'B' ? OrderSide.BUY : OrderSide.SELL;
        
        // Map Kotak status to our OrderStatus enum
        let status = OrderStatus.PENDING;
        const kotakStatus = (raw.ordSt || raw.stat || '').toLowerCase();
        if (kotakStatus.includes('complete') || kotakStatus.includes('execute')) status = OrderStatus.COMPLETE;
        else if (kotakStatus.includes('reject')) status = OrderStatus.REJECTED;
        else if (kotakStatus.includes('cancel')) status = OrderStatus.CANCELLED;
        else if (kotakStatus.includes('open') || kotakStatus.includes('pending')) status = OrderStatus.PENDING;
        
        const quantity = parseInt(raw.qty || '0', 10);
        const filledQuantity = parseInt(raw.fldQty || raw.flQty || '0', 10);
        const price = parseFloat(raw.prc || raw.price || '0');
        const averagePrice = parseFloat(raw.avgPrc || raw.avgprc || '0');
        
        // Parse timestamp – ordDtTm from Kotak is typically "dd-MMM-yyyy HH:mm:ss"
        // e.g. "26-Feb-2026 09:15:32"
        const parseKotakDate = (s: string): Date => {
          if (!s) return new Date();
          // Try ISO first
          const d = new Date(s);
          if (!isNaN(d.getTime())) return d;
          // Kotak dd-MMM-yyyy HH:mm:ss
          const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
          if (m) {
            return new Date(`${m[2]} ${m[1]} ${m[3]} ${m[4]}:${m[5]}:${m[6]}`);
          }
          return new Date();
        };

        // Order placed time
        const orderTimeStr = raw.ordDtTm || raw.flDt || raw.ts || '';
        const timestamp = parseKotakDate(orderTimeStr);

        // Fill time (when the trade actually executed) – separate field on Kotak
        const fillTimeStr = raw.flDt
          ? `${raw.flDt}${raw.flTm ? ' ' + raw.flTm : ''}`
          : '';
        const fillTimestamp = fillTimeStr ? parseKotakDate(fillTimeStr) : undefined;

        return {
          orderId,
          symbol,
          exchange: raw.exSeg || 'nse_cm',
          side,
          quantity,
          filledQuantity,
          price,
          averagePrice,
          orderType: (raw.prcTp || raw.pt || 'MKT') as any,
          productType: raw.prod as any || 'CNC',
          status,
          timestamp,
          fillTimestamp,
          message: raw.rejRsn || undefined,
        };
      };

      const rawOrders: any[] = ordersRes.orders || [];
      const mappedOrders: Order[] = rawOrders.map(mapKotakOrder);
      console.log('[useKotakTrading] 📋 Mapped orders:', mappedOrders);

      // Fetch live LTP for ALL positions in a SINGLE batch API call
      console.log('[useKotakTrading] 💰 Fetching live LTP (batch) for', mappedPositions.length, 'positions...');
      let ltpMap = new Map<string, number>();
      if (mappedPositions.length > 0) {
        try {
          // For F&O: quoteSymbol = tok (token number, e.g. "54883")
          // For equities: quoteSymbol = pSymbol (e.g. "AXISBANK")
          // Kotak Quotes exchange_token in response = the symbol we query with
          const queries = mappedPositions.map((p: any) => ({
            segment: p.exchange || 'nse_cm',
            symbol: p.quoteSymbol || p.symbol,
          }));
          console.log('[useKotakTrading] 📤 LTP queries:', queries.map(q => `${q.segment}|${q.symbol}`));
          ltpMap = await kotakTradingService.getBatchLTP(queries);
          console.log('[useKotakTrading] 📈 LTP map:', Object.fromEntries(ltpMap));
        } catch (ltpErr) {
          console.warn('[useKotakTrading] ⚠️ Batch LTP fetch failed, using position LTP:', ltpErr);
        }
      }

      const positionsWithLTP = mappedPositions.map((position: any) => {
        // Look up LTP by quoteSymbol (= tok for F&O, pSymbol for equities)
        // Fallback chain: quoteSymbol → symbol (trdSym) → pSymbol
        //   → last known LTP from prev state (so UI doesn't flash 0)
        const freshLtp = ltpMap.get(position.quoteSymbol)
          || ltpMap.get(position.symbol)
          || ltpMap.get(position.pSymbol)
          || 0;

        // Preserve previously displayed LTP when quotes temporarily fail
        // Use setState functional form reference via a ref — avoid stale closure
        const ltp = freshLtp > 0 ? freshLtp : (position.ltp || 0);

        if (freshLtp <= 0) {
          console.warn(`[useKotakTrading] ⚠️ No LTP for ${position.symbol} (quoteSymbol=${position.quoteSymbol})`);
        }

        const netQty = position.quantity;
        // Use preserved raw amounts (no rounding drift from avg * qty reconstruction)
        const buyAmt  = position.rawBuyAmt  ?? (position.buyPrice  * position.buyQuantity);
        const sellAmt = position.rawSellAmt ?? (position.sellPrice * position.sellQuantity);

        // P&L = realised (sell-buy) + unrealised (netQty * ltp)
        // For squared-off (qty=0): unrealised=0, P&L = pure realised
        const pnl = (sellAmt - buyAmt) + (netQty * ltp);
        const invested = buyAmt > 0 ? buyAmt : (Math.abs(netQty) * position.buyPrice);
        const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

        return {
          ...position,
          ltp,
          pnl: parseFloat(pnl.toFixed(2)),
          pnlPercentage: parseFloat(pnlPct.toFixed(2)),
        };
      });

      // Sort positions by symbol for stable/consistent ordering
      const sortedPositions = positionsWithLTP.sort((a, b) => {
        return (a.symbol || '').localeCompare(b.symbol || '');
      });

      // P&L only counts open positions (qty != 0)
      const totalPnL = sortedPositions
        .filter(p => (p.quantity || 0) !== 0)
        .reduce((sum, p) => sum + p.pnl, 0);

      const openCount = sortedPositions.filter(p => (p.quantity || 0) !== 0).length;
      console.log('[useKotakTrading] 📊 Positions:', {
        total: sortedPositions.length,
        open: openCount,
        closed: sortedPositions.length - openCount,
      });

      // Keep ALL positions in state (open + closed) so UI can show them
      // The trading rules engine filters to open-only positions internally
      setState(prev => ({
        ...prev,
        balance: balanceRes.balance || 0,
        positions: sortedPositions, // ← All positions (open + closed)
        orders: mappedOrders,
        totalPnL,
      }));

      console.log('[useKotakTrading] ✅ Data refreshed with live prices');
    } catch (error) {
      console.error('[useKotakTrading] ❌ Refresh error:', error);
      // If the session expired, clear it and force re-login
      if ((error as any)?.isSessionExpired || (error instanceof Error && error.message === 'SESSION_EXPIRED')) {
        console.warn('[useKotakTrading] 🔑 Session expired — clearing session, forcing re-login');
        localStorage.removeItem('kotak_session');
        kotakTradingService.disconnect();
        setState(prev => ({
          ...prev,
          isConnected: false,
          sessionExpired: true,
          error: 'Your session has expired. Please login again.',
          positions: [],
          orders: [],
          balance: 0,
        }));
        return;
      }
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to refresh data',
      }));
    }
  };

  /**
   * Get LTP for a symbol
   */
  const getLTP = async (symbol: string): Promise<number> => {
    try {
      const result = await kotakTradingService.getLTP(symbol);
      return result.ltp;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to fetch LTP',
      }));
      return 0;
    }
  };

  /**
   * Directly update a position's LTP in React state (no API call).
   * Called by the WebSocket feed in TradingPanel on every live tick.
   */
  const updatePositionLTP = (symbol: string, ltp: number) => {
    setState(prev => {
      const updated = prev.positions.map(p => {
        if (p.symbol !== symbol) return p;
        // Recalculate P&L with new LTP
        const qty = p.quantity || 0;
        const buyQty = (p as any).buyQuantity || 0;
        const sellQty = (p as any).sellQuantity || 0;
        const buyPrice = (p as any).buyPrice || 0;
        const sellPrice = (p as any).sellPrice || 0;
        const bought = buyQty * buyPrice;
        const sold = sellQty * sellPrice;
        const current = Math.abs(qty) * ltp;
        const pnl = qty >= 0
          ? current - bought + sold
          : sold - current + bought;
        const invested = buyQty * buyPrice || 1;
        const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
        return {
          ...p,
          ltp,
          pnl: parseFloat(pnl.toFixed(2)),
          pnlPercentage: parseFloat(pnlPct.toFixed(2)),
        };
      });
      const totalPnL = updated
        .filter(p => (p.quantity || 0) !== 0)
        .reduce((sum, p) => sum + p.pnl, 0);
      return { ...prev, positions: updated, totalPnL };
    });
  };

  /**
   * Auto-connect on mount - DISABLED
   * Connection only happens after Kotak authentication is complete
   * The TradingPanel component will call connect() after login
   */
  useEffect(() => {
    console.log('📌 useKotakTrading mounted - waiting for explicit connect() call');
    // Don't auto-connect - wait for explicit authentication
    // connect();

    return () => {
      // Cleanup if needed
    };
  }, []);

  return {
    ...state,
    connect,
    connectWithSession,
    disconnect,
    buy,
    sell,
    cancelOrder,
    modifyOrder,
    exitPosition,
    refreshData,
    getLTP,
    updatePositionLTP,
  };
}
