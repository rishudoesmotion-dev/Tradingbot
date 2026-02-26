// src/hooks/useKotakTrading.ts
import { useState, useEffect } from 'react';
import { kotakTradingService } from '@/lib/services/KotakTradingService';
import { Order, Position } from '@/types/broker.types';
import { ProductType } from '@/types/broker.types';

export interface UseTradingState {
  isConnected: boolean;
  isLoading: boolean;
  balance: number;
  positions: Position[];
  orders: Order[];
  error: string | null;
  totalPnL: number;
}

export interface UseTradingActions {
  connect: () => Promise<void>;
  connectWithSession: (sessionInfo: any) => Promise<void>;
  disconnect: () => Promise<void>;
  buy: (config: any) => Promise<void>;
  sell: (config: any) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  exitPosition: (symbol: string) => Promise<void>;
  killSwitch: () => Promise<void>;
  refreshData: () => Promise<void>;
  getLTP: (symbol: string) => Promise<number>;
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
   * Kill Switch - Exit all positions
   */
  const killSwitch = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await kotakTradingService.exitAllPositions();

      if (result.success) {
        await refreshData();
      } else {
        setState(prev => ({ ...prev, error: result.message }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Kill switch failed',
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Refresh all data
   */
  const refreshData = async () => {
    try {
      const [balanceRes, positionsRes, ordersRes] = await Promise.all([
        kotakTradingService.getBalance(),
        kotakTradingService.getPositions(),
        kotakTradingService.getOrders(),
      ]);

      const totalPnL = positionsRes.positions.reduce((sum: number, p: any) => sum + p.pnl, 0);

      setState(prev => ({
        ...prev,
        balance: balanceRes.balance,
        positions: positionsRes.positions,
        orders: ordersRes.orders,
        totalPnL,
      }));
    } catch (error) {
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
    exitPosition,
    killSwitch,
    refreshData,
    getLTP,
  };
}
