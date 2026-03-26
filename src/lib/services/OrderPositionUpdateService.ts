/**
 * Hybrid Order & Position Update Service
 * 
 * Supports two streaming modes:
 * 1. WebSocket (default) - Real-time event-driven updates via Kotak Neo WebSocket API
 * 2. Polling (fallback) - Fallback to polling if WebSocket fails or is disabled
 * 
 * Switch mode via environment: STREAM_MODE=websocket or STREAM_MODE=polling
 * 
 * Usage:
 * ```typescript
 * const service = new OrderPositionUpdateService();
 * await service.start(sessionInfo, onOrderUpdate, onPositionUpdate);
 * // ... when done
 * service.stop();
 * ```
 */

import { getDynamicPollingService } from './DynamicPollingService';

export type StreamMode = 'websocket' | 'polling';

export interface OrderUpdate {
  type: 'ORDER_UPDATE';
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  status: string;
  quantity: number;
  filledQty: number;
  price: number;
  timestamp: string;
  exchangeOrderId?: string;
}

export interface PositionUpdate {
  type: 'POSITION_UPDATE';
  symbol: string;
  quantity: number;
  buyPrice: number;
  currentLTP: number;
  pnl: number;
  pnlPercentage: number;
  timestamp: string;
}

export type StreamUpdate = OrderUpdate | PositionUpdate;

/**
 * Hybrid streaming service with WebSocket and polling fallback
 */
export class OrderPositionUpdateService {
  private mode: StreamMode;
  private ws: WebSocket | null = null;
  private isPollingActive = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isActive = false;
  private sessionInfo: any = null;
  private onOrderUpdate: ((update: OrderUpdate) => void) | null = null;
  private onPositionUpdate: ((update: PositionUpdate) => void) | null = null;

  constructor() {
    // Determine stream mode from environment, default to websocket
    this.mode = (process.env.NEXT_PUBLIC_STREAM_MODE as StreamMode) || 'websocket';
    console.log(`[OrderPositionUpdateService] Initialized in ${this.mode} mode`);
  }

  /**
   * Start streaming order and position updates
   * @param sessionInfo - Kotak Neo session info containing connection details
   * @param onOrderUpdate - Callback when order is updated
   * @param onPositionUpdate - Callback when position is updated
   */
  async start(
    sessionInfo: any,
    onOrderUpdate: (update: OrderUpdate) => void,
    onPositionUpdate: (update: PositionUpdate) => void
  ): Promise<void> {
    this.sessionInfo = sessionInfo;
    this.onOrderUpdate = onOrderUpdate;
    this.onPositionUpdate = onPositionUpdate;
    this.isActive = true;

    if (this.mode === 'websocket') {
      console.log('[OrderPositionUpdateService] Starting WebSocket mode');
      try {
        await this.startWebSocket();
      } catch (error) {
        console.error('[OrderPositionUpdateService] WebSocket failed:', error);
        console.log('[OrderPositionUpdateService] Falling back to polling mode');
        this.mode = 'polling';
        await this.startPolling();
      }
    } else {
      console.log('[OrderPositionUpdateService] Starting Polling mode');
      await this.startPolling();
    }
  }

  /**
   * WebSocket-based streaming
   */
  private async startWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL from session info
        const baseUrl = this.sessionInfo?.baseUrl || process.env.NEXT_PUBLIC_KOTAK_BASE_URL;
        if (!baseUrl) {
          throw new Error('No base URL provided for WebSocket');
        }

        const wsUrl = baseUrl
          .replace(/^https?:/, 'wss:')
          .replace(/^http:/, 'ws:')
          .replace(/\/$/, '') + '/order-position-stream';

        console.log('[WebSocket] Connecting to:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected');
          this.reconnectAttempts = 0;

          // Subscribe to order and position updates
          this.sendWebSocketMessage({
            type: 'SUBSCRIBE',
            channels: ['orders', 'positions'],
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleStreamUpdate(data);
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('[WebSocket] Disconnected');
          if (this.isActive) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Polling-based fallback streaming
   */
  private async startPolling(): Promise<void> {
    try {
      // Use DynamicPollingService for intelligent polling
      const pollingService = getDynamicPollingService();

      // Polling callback - would fetch orders/positions and emit updates
      const pollCallback = async () => {
        try {
          // This is a placeholder - in real implementation, you would:
          // 1. Call Kotak Neo API to get current orders
          // 2. Compare with previous state
          // 3. Emit OrderUpdate events for changed orders
          // 4. Call Kotak Neo API to get current positions
          // 5. Compare with previous state
          // 6. Emit PositionUpdate events for changed positions

          console.log('[Polling] Fetching order/position updates...');
          // Actual implementation would call trading store refresh
          // await trading.refreshData();
        } catch (error) {
          console.error('[Polling] Error fetching updates:', error);
        }
      };

      // Start polling with callback
      pollingService.startPolling(pollCallback, false);
      this.isPollingActive = true;
      console.log('[Polling] Started with adaptive intervals');
    } catch (error) {
      console.error('[Polling] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Handle incoming stream updates
   */
  private handleStreamUpdate(data: StreamUpdate): void {
    if (data.type === 'ORDER_UPDATE') {
      console.log(
        '[OrderPositionUpdateService] Order update:',
        data.orderId,
        data.status
      );
      this.onOrderUpdate?.(data as OrderUpdate);
    } else if (data.type === 'POSITION_UPDATE') {
      console.log(
        '[OrderPositionUpdateService] Position update:',
        data.symbol,
        `PnL: ${data.pnl}`
      );
      this.onPositionUpdate?.(data as PositionUpdate);
    }
  }

  /**
   * Send message via WebSocket
   */
  private sendWebSocketMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Not connected, cannot send message:', message);
    }
  }

  /**
   * Attempt to reconnect WebSocket with exponential backoff
   */
  private attemptReconnect(): void {
    if (!this.isActive) return;

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached, switching to polling');
      this.mode = 'polling';
      this.startPolling().catch((error) => {
        console.error('[OrderPositionUpdateService] Polling fallback also failed:', error);
      });
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.isActive && this.mode === 'websocket') {
        this.startWebSocket().catch((error) => {
          console.error('[WebSocket] Reconnection failed:', error);
          this.attemptReconnect();
        });
      }
    }, delay);
  }

  /**
   * Stop all streaming
   */
  stop(): void {
    console.log('[OrderPositionUpdateService] Stopping...');
    this.isActive = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.isPollingActive) {
      const pollingService = getDynamicPollingService();
      pollingService.stopPolling();
      this.isPollingActive = false;
    }

    this.onOrderUpdate = null;
    this.onPositionUpdate = null;
  }

  /**
   * Get current stream mode
   */
  getMode(): StreamMode {
    return this.mode;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    if (this.mode === 'websocket') {
      return this.ws?.readyState === WebSocket.OPEN;
    } else {
      return this.isPollingActive;
    }
  }

  /**
   * Get status information
   */
  getStatus(): {
    mode: StreamMode;
    isConnected: boolean;
    reconnectAttempts: number;
    isActive: boolean;
  } {
    return {
      mode: this.mode,
      isConnected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      isActive: this.isActive,
    };
  }

  /**
   * Force switch to polling mode (for manual fallback)
   */
  switchToPolling(): void {
    console.log('[OrderPositionUpdateService] Manually switching to polling mode');
    this.mode = 'polling';

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.sessionInfo && this.onOrderUpdate && this.onPositionUpdate) {
      this.startPolling().catch((error) => {
        console.error('[OrderPositionUpdateService] Failed to switch to polling:', error);
      });
    }
  }

  /**
   * Force switch back to WebSocket mode
   */
  switchToWebSocket(): void {
    console.log('[OrderPositionUpdateService] Manually switching to WebSocket mode');
    this.mode = 'websocket';

    if (this.isPollingActive) {
      const pollingService = getDynamicPollingService();
      pollingService.stopPolling();
      this.isPollingActive = false;
    }

    if (this.sessionInfo && this.onOrderUpdate && this.onPositionUpdate) {
      this.startWebSocket().catch((error) => {
        console.error('[OrderPositionUpdateService] Failed to switch to WebSocket:', error);
      });
    }
  }
}

// Singleton instance
let instance: OrderPositionUpdateService | null = null;

/**
 * Get or create OrderPositionUpdateService instance
 */
export function getOrderPositionUpdateService(): OrderPositionUpdateService {
  if (!instance) {
    instance = new OrderPositionUpdateService();
  }
  return instance;
}

/**
 * Reset service instance (mainly for testing)
 */
export function resetOrderPositionUpdateService(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
