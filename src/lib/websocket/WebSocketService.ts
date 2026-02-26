// src/lib/websocket/WebSocketService.ts
import { io, Socket } from 'socket.io-client';
import { MarketDepth } from '@/types/broker.types';

export class WebSocketService {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private subscribers: Map<string, (data: MarketDepth) => void> = new Map();

  constructor(private serverUrl: string) {}

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.serverUrl, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5
        });

        this.socket.on('connect', () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          resolve();
        });

        this.socket.on('disconnect', () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
        });

        this.socket.on('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });

        this.socket.on('market_data', (data: MarketDepth) => {
          this.handleMarketData(data);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribe to market data for specific symbols
   */
  subscribe(symbols: Array<{ symbol: string; exchange: string }>, callback: (data: MarketDepth) => void): void {
    if (!this.socket) {
      throw new Error('WebSocket not connected');
    }

    symbols.forEach(({ symbol, exchange }) => {
      const key = `${exchange}:${symbol}`;
      this.subscribers.set(key, callback);
    });

    // Emit subscription request to server
    this.socket.emit('subscribe', { symbols });
  }

  /**
   * Unsubscribe from market data
   */
  unsubscribe(symbols: Array<{ symbol: string; exchange: string }>): void {
    if (!this.socket) return;

    symbols.forEach(({ symbol, exchange }) => {
      const key = `${exchange}:${symbol}`;
      this.subscribers.delete(key);
    });

    // Emit unsubscription request to server
    this.socket.emit('unsubscribe', { symbols });
  }

  /**
   * Handle incoming market data
   */
  private handleMarketData(data: MarketDepth): void {
    const key = `${data.symbol}`;
    const callback = this.subscribers.get(key);
    
    if (callback) {
      callback(data);
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.subscribers.clear();
    }
  }

  /**
   * Check connection status
   */
  connected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let wsService: WebSocketService | null = null;

export const getWebSocketService = (): WebSocketService => {
  if (!wsService) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_SERVER_URL || 'http://localhost:3001';
    wsService = new WebSocketService(wsUrl);
  }
  return wsService;
};
