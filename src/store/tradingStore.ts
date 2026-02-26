// src/store/tradingStore.ts
import { create } from 'zustand';
import { Order, Position, MarketDepth, OrderRequest } from '@/types/broker.types';
import { DayStats, RiskConfig } from '@/types/risk.types';
import { BaseBroker } from '@/lib/brokers/BaseBroker';
import { RiskManager } from '@/lib/risk/RiskManager';

interface TradingState {
  // Broker & Risk Manager
  broker: BaseBroker | null;
  riskManager: RiskManager | null;
  isConnected: boolean;
  
  // Trading Data
  orders: Order[];
  positions: Position[];
  marketData: Map<string, MarketDepth>;
  
  // Stats & Config
  dayStats: DayStats | null;
  riskConfig: RiskConfig | null;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  killSwitchActive: boolean;
  
  // Actions
  setBroker: (broker: BaseBroker) => void;
  setRiskManager: (riskManager: RiskManager) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  
  placeOrder: (orderRequest: OrderRequest) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  
  fetchOrders: () => Promise<void>;
  fetchPositions: () => Promise<void>;
  updateMarketData: (symbol: string, data: MarketDepth) => void;
  
  fetchDayStats: () => Promise<void>;
  updateRiskConfig: (config: RiskConfig) => Promise<void>;
  
  activateKillSwitch: () => Promise<void>;
  deactivateKillSwitch: () => void;
  
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useTradingStore = create<TradingState>((set, get) => ({
  // Initial State
  broker: null,
  riskManager: null,
  isConnected: false,
  orders: [],
  positions: [],
  marketData: new Map(),
  dayStats: null,
  riskConfig: null,
  isLoading: false,
  error: null,
  killSwitchActive: false,

  // Actions
  setBroker: (broker) => set({ broker }),
  
  setRiskManager: (riskManager) => set({ riskManager }),

  connect: async () => {
    const { broker, riskManager } = get();
    if (!broker || !riskManager) {
      set({ error: 'Broker or RiskManager not initialized' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const success = await broker.authenticate();
      if (success) {
        await riskManager.loadConfig();
        set({ 
          isConnected: true, 
          riskConfig: riskManager.getConfig() 
        });
        
        // Fetch initial data
        await get().fetchOrders();
        await get().fetchPositions();
        await get().fetchDayStats();
      } else {
        set({ error: 'Authentication failed' });
      }
    } catch (error) {
      set({ error: `Connection failed: ${error}` });
    } finally {
      set({ isLoading: false });
    }
  },

  disconnect: async () => {
    const { broker } = get();
    if (broker) {
      await broker.disconnect();
    }
    set({ 
      isConnected: false, 
      orders: [], 
      positions: [], 
      marketData: new Map() 
    });
  },

  placeOrder: async (orderRequest) => {
    const { broker, riskManager, killSwitchActive } = get();
    
    if (!broker || !riskManager) {
      set({ error: 'System not initialized' });
      return;
    }

    if (killSwitchActive) {
      set({ error: 'Trading disabled: Kill Switch is active' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // Risk validation
      const validation = await riskManager.validateOrder(orderRequest);
      
      if (!validation.isValid) {
        set({ error: `Order blocked: ${validation.errors.join(', ')}` });
        return;
      }

      // Show warnings if any
      if (validation.warnings.length > 0) {
        console.warn('Order warnings:', validation.warnings);
      }

      // Place order
      const order = await broker.placeOrder(orderRequest);
      
      // Log trade
      await riskManager.logTrade({
        orderId: order.orderId,
        symbol: order.symbol,
        exchange: order.exchange,
        side: order.side,
        quantity: order.quantity,
        price: order.price,
        pnl: 0, // Will be calculated on exit
        timestamp: new Date(),
        brokerName: 'SHOONYA'
      });

      // Refresh orders and stats
      await get().fetchOrders();
      await get().fetchDayStats();

      // Check if kill switch should activate
      if (await riskManager.shouldActivateKillSwitch()) {
        await get().activateKillSwitch();
      }

    } catch (error) {
      set({ error: `Order failed: ${error}` });
    } finally {
      set({ isLoading: false });
    }
  },

  cancelOrder: async (orderId) => {
    const { broker } = get();
    if (!broker) return;

    set({ isLoading: true, error: null });

    try {
      await broker.cancelOrder(orderId);
      await get().fetchOrders();
    } catch (error) {
      set({ error: `Cancellation failed: ${error}` });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchOrders: async () => {
    const { broker } = get();
    if (!broker) return;

    try {
      const orders = await broker.getOrders();
      set({ orders });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  },

  fetchPositions: async () => {
    const { broker, riskManager } = get();
    if (!broker) return;

    try {
      const positions = await broker.getPositions();
      set({ positions });

      // Update positions in database
      if (riskManager) {
        for (const position of positions) {
          await riskManager.updatePosition(position);
        }
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    }
  },

  updateMarketData: (symbol, data) => {
    set((state) => {
      const newMarketData = new Map(state.marketData);
      newMarketData.set(symbol, data);
      return { marketData: newMarketData };
    });
  },

  fetchDayStats: async () => {
    const { riskManager } = get();
    if (!riskManager) return;

    try {
      const dayStats = await riskManager.getDayStats();
      set({ dayStats });
    } catch (error) {
      console.error('Failed to fetch day stats:', error);
    }
  },

  updateRiskConfig: async (config) => {
    const { riskManager } = get();
    if (!riskManager) return;

    set({ isLoading: true, error: null });

    try {
      await riskManager.saveConfig(config);
      set({ riskConfig: config });
    } catch (error) {
      set({ error: `Failed to update risk config: ${error}` });
    } finally {
      set({ isLoading: false });
    }
  },

  activateKillSwitch: async () => {
    const { broker } = get();
    if (!broker) return;

    set({ isLoading: true, killSwitchActive: true });

    try {
      // Exit all positions
      await broker.exitAllPositions();
      
      // Refresh data
      await get().fetchPositions();
      await get().fetchOrders();
      
      set({ error: '🔴 KILL SWITCH ACTIVATED: All positions closed' });
    } catch (error) {
      set({ error: `Kill switch failed: ${error}` });
    } finally {
      set({ isLoading: false });
    }
  },

  deactivateKillSwitch: () => {
    set({ killSwitchActive: false, error: null });
  },

  setError: (error) => set({ error }),
  
  clearError: () => set({ error: null }),
}));
