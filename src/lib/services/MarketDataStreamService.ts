/**
 * Market Data Hybrid Streaming Service (WebSocket + Polling Fallback)
 *
 * Uses Kotak Neo HSM (HyperSync Market) WebSocket for real-time LTP streaming.
 *
 * Kotak Neo HSM API Details:
 * - Endpoint: wss://mlhsm.kotaksecurities.com  (production)
 * - Authentication: send on onopen: {Authorization: tradingToken, Sid: tradingSid, type: "cn"}
 * - Heartbeat: every 30s send {type: "ti", scrips: ""}
 * - Subscribe: {type: "mws", scrips: "nse_cm|11536&nse_fo|54883", channelnum: 1}
 * - Unsubscribe: {type: "us", scrips: "nse_cm|11536", channelnum: 1}
 * - SDK: HSWebSocket (from hslib.js, loaded via <script> in browser)
 *   NOTE: HSWebSocket.onmessage receives raw string (not MessageEvent)
 *
 * Session info expected: { tradingToken, tradingSid, baseUrl }
 */

export interface PriceUpdate {
  symbol: string;     // scrip key: "nse_fo|54883" or "nse_cm|11536"
  ltp: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  timestamp: string;
}

export interface StreamSubscription {
  segment: string;
  symbol: string;
  tradingSymbol?: string;
}

/**
 * Market Data WebSocket Streaming Service
 * Streams real-time LTP updates for subscribed instruments via Kotak Neo HSM
 */
export class MarketDataStreamService {
  private ws: any = null;         // HSWebSocket or native WebSocket
  private mode: 'websocket' | 'polling' = 'websocket';
  private isPollingActive = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isActive = false;
  private sessionInfo: any = null;
  private subscribedScrips: Set<string> = new Set();
  private onPriceUpdate: ((update: PriceUpdate) => void) | null = null;
  private onBatchPriceUpdate: ((updates: PriceUpdate[]) => void) | undefined = undefined;
  private priceBuffer: Map<string, PriceUpdate> = new Map();
  private bufferFlushInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private BUFFER_FLUSH_MS = 200;

  // HSM WebSocket URL (production)
  private readonly HSM_URL = 'wss://mlhsm.kotaksecurities.com';
  // Channel number for subscriptions
  private readonly CHANNEL_NUM = 1;

  constructor() {
    console.log('[MarketDataStreamService] Initialized');
  }

  /**
   * Subscribe to market data updates using Kotak Neo HSM
   * @param sessionInfo - { tradingToken, tradingSid, baseUrl }
   * @param scrips - Array of scrips: 'nse_cm|11536' or 'nse_fo|54883'
   * @param onPriceUpdate - Callback for individual price updates
   * @param onBatchPriceUpdate - Optional callback for batched updates
   */
  async subscribe(
    sessionInfo: any,
    scrips: Array<StreamSubscription | string>,
    onPriceUpdate: (update: PriceUpdate) => void,
    onBatchPriceUpdate?: (updates: PriceUpdate[]) => void
  ): Promise<void> {
    this.sessionInfo = sessionInfo;
    this.onPriceUpdate = onPriceUpdate;
    this.onBatchPriceUpdate = onBatchPriceUpdate;
    this.isActive = true;

    // Normalize to 'segment|token' format
    let scripsToSubscribe: string[] = [];
    if (Array.isArray(scrips) && scrips.length > 0) {
      if (typeof scrips[0] === 'string') {
        scripsToSubscribe = scrips as string[];
      } else {
        scripsToSubscribe = (scrips as StreamSubscription[]).map(
          (sub) => `${sub.segment}|${sub.tradingSymbol || sub.symbol}`
        );
      }
    }

    scripsToSubscribe.forEach((s) => this.subscribedScrips.add(s));

    console.log(`[MarketDataStreamService] Subscribing to ${scripsToSubscribe.length} scrips`);

    try {
      await this.startWebSocket(scripsToSubscribe);
      this.startBufferFlush();
    } catch (error) {
      console.warn('[MarketDataStreamService] WebSocket failed, switching to polling:', error);
      this.mode = 'polling';
      try {
        await this.startPolling(scripsToSubscribe);
        this.startBufferFlush();
      } catch (pollError) {
        console.error('[MarketDataStreamService] Polling fallback also failed:', pollError);
        throw pollError;
      }
    }
  }

  /**
   * Start HSM WebSocket connection using Kotak Neo HSWebSocket SDK
   * Falls back to native WebSocket if SDK not available
   */
  private async startWebSocket(scrips: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.sessionInfo) {
          throw new Error('No session info for WebSocket connection');
        }

        if (typeof window === 'undefined') {
          reject(new Error('WebSocket only available in browser'));
          return;
        }

        // Use HSWebSocket SDK if available, otherwise native WebSocket
        const WsClass =
          typeof (window as any).HSWebSocket === 'function'
            ? (window as any).HSWebSocket
            : WebSocket;

        const usingSDK = WsClass === (window as any).HSWebSocket;
        console.log(`[WebSocket-HSM] Connecting to ${this.HSM_URL} via ${usingSDK ? 'HSWebSocket SDK' : 'native WebSocket'}`);

        this.ws = new WsClass(this.HSM_URL);

        this.ws.onopen = () => {
          console.log('[WebSocket-HSM] ✅ Connected');
          this.reconnectAttempts = 0;
          this.mode = 'websocket';

          // Step 1: Authenticate
          this.authenticateHSM();

          // Step 2: Subscribe after short delay (let auth complete)
          setTimeout(() => {
            if (scrips.length > 0) {
              this.subscribeToScrips(scrips);
            }
            resolve();
          }, 800);
        };

        // HSWebSocket onmessage receives raw string; native WebSocket receives MessageEvent
        this.ws.onmessage = (msgOrEvent: any) => {
          try {
            const raw = typeof msgOrEvent === 'string' ? msgOrEvent : msgOrEvent?.data;
            if (!raw) return;
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            this.handleMarketData(data);
          } catch {
            // Binary frames or non-JSON — ignore silently
          }
        };

        this.ws.onclose = () => {
          console.log('[WebSocket-HSM] Disconnected');
          this.stopHeartbeat();
          if (this.isActive && this.mode === 'websocket') {
            this.attemptReconnect(scrips);
          }
        };

        this.ws.onerror = (err: any) => {
          console.error('[WebSocket-HSM] Error:', err);
          reject(new Error('HSM WebSocket error'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Send HSM authentication message */
  private authenticateHSM(): void {
    if (!this.ws || this.ws.readyState !== 1 /* OPEN */) return;
    if (!this.sessionInfo) return;

    const authMsg = {
      Authorization: this.sessionInfo.tradingToken || this.sessionInfo.token || '',
      Sid: this.sessionInfo.tradingSid || this.sessionInfo.sid || '',
      type: 'cn',
    };

    console.log('[WebSocket-HSM] 🔐 Sending auth...');
    this.ws.send(JSON.stringify(authMsg));

    // Start heartbeat (30s interval as per Kotak SDK)
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ type: 'ti', scrips: '' }));
        console.log('[WebSocket-HSM] 💓 Heartbeat sent');
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Subscribe to scrips on the HSM WebSocket
   * Format: {type:"mws", scrips:"nse_cm|11536&nse_fo|54883", channelnum:1}
   */
  private subscribeToScrips(scrips: string[]): void {
    if (!this.ws || this.ws.readyState !== 1) {
      console.warn('[WebSocket-HSM] Not open, cannot subscribe');
      return;
    }

    const scripsString = scrips.join('&');
    const msg = { type: 'mws', scrips: scripsString, channelnum: this.CHANNEL_NUM };
    console.log('[WebSocket-HSM] 📤 Subscribing:', scripsString);
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Handle incoming HSM market data messages
   * Kotak HSM sends various message types; price data comes as arrays or objects
   */
  private handleMarketData(data: any): void {
    if (!data) return;

    const t = data.type || data.t || '';

    // Acknowledgements / status messages
    if (t === 'cn_ack' || t === 'connection_ack' || t === 'ack') {
      console.log('[WebSocket-HSM] ✅ Auth acknowledged');
      return;
    }
    if (t === 'mws_ack' || t === 'subscribe_ack') {
      console.log('[WebSocket-HSM] ✅ Subscription acknowledged');
      return;
    }
    if (t === 'ti') {
      // Heartbeat echo — ignore
      return;
    }

    // Price data: Kotak HSM sends arrays of quote objects or a single object
    // Common field names from Kotak: tk (token), e (exchange), ltp/ltP/lp, pc (% change), c (close)
    const quotes: any[] = Array.isArray(data) ? data : (data.data ? data.data : [data]);

    for (const q of quotes) {
      if (!q) continue;

      // Identify scrip key from token + exchange
      const tok = q.tk || q.token || q.scrip_code || q.instrument_token || '';
      const exch = (q.e || q.exchange || q.segment || '').toLowerCase();

      // Skip non-price messages
      const rawLtp = q.ltp ?? q.ltP ?? q.lp ?? q.last_price;
      if (!tok && rawLtp === undefined) continue;

      // Build scrip key: "nse_fo|54883"
      const scripKey = tok && exch ? `${exch}|${tok}` : (q.scrip || '');

      const ltp = parseFloat(String(rawLtp || '0')) || 0;
      if (ltp === 0 && !scripKey) continue;

      const priceUpdate: PriceUpdate = {
        symbol: scripKey || tok || 'UNKNOWN',
        ltp,
        change: parseFloat(String(q.change || q.chg || q.pc || '0')) || 0,
        changePercent: parseFloat(String(q.per_change || q.pChange || q.pc || '0')) || 0,
        volume: parseInt(String(q.volume || q.v || '0')) || undefined,
        open: parseFloat(String(q.open || q.o || '0')) || undefined,
        high: parseFloat(String(q.high || q.h || '0')) || undefined,
        low: parseFloat(String(q.low || q.l || '0')) || undefined,
        close: parseFloat(String(q.close || q.c || '0')) || undefined,
        timestamp: new Date().toISOString(),
      };

      this.priceBuffer.set(priceUpdate.symbol, priceUpdate);
      if (this.onPriceUpdate) this.onPriceUpdate(priceUpdate);

      console.log(`[WebSocket-HSM] 📈 ${priceUpdate.symbol}: ₹${priceUpdate.ltp.toFixed(2)}`);
    }
  }

  /** Polling fallback using QuotesService REST API */
  private async startPolling(scrips: string[]): Promise<void> {
    try {
      const { getDynamicPollingService } = await import('./DynamicPollingService');
      const { quotesService } = await import('./QuotesService');

      const pollingService = getDynamicPollingService();

      const pollCallback = async () => {
        try {
          if (scrips.length === 0) return;

          const queries = scrips.map((s) => {
            const [segment, symbol] = s.split('|');
            return { segment, symbol };
          });

          const response = await quotesService.getQuotes(queries, 'ltp');
          if (!response.success || !response.data) return;

          (response.data as any[]).forEach((q: any, idx: number) => {
            const query = queries[idx];
            const scripKey = `${query.segment}|${query.symbol}`;
            const priceUpdate: PriceUpdate = {
              symbol: scripKey,
              ltp: parseFloat(q.ltp || q.ltP || q.last_price || '0') || 0,
              change: parseFloat(q.change || q.chg || '0') || 0,
              changePercent: parseFloat(q.per_change || q.pChange || '0') || 0,
              timestamp: new Date().toISOString(),
            };
            this.priceBuffer.set(scripKey, priceUpdate);
            if (this.onPriceUpdate) this.onPriceUpdate(priceUpdate);
          });
        } catch (error) {
          console.error('[Polling] Error:', error);
        }
      };

      pollingService.startPolling(pollCallback, scrips.length > 0);
      this.isPollingActive = true;
      console.log('[Polling] Started as WebSocket fallback');
    } catch (error) {
      console.error('[Polling] Failed to start:', error);
      throw error;
    }
  }

  /** Reconnect with exponential backoff */
  private attemptReconnect(scrips: string[]): void {
    if (!this.isActive || this.mode !== 'websocket') return;

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.warn('[WebSocket-HSM] Max reconnects reached — switching to polling');
      this.mode = 'polling';
      this.startPolling(scrips).catch(console.error);
      return;
    }

    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 30000);
    console.log(`[WebSocket-HSM] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.isActive && this.mode === 'websocket') {
        this.startWebSocket(scrips).catch(() => this.attemptReconnect(scrips));
      }
    }, delay);
  }

  /** Flush price buffer to batch callback every 200ms */
  private startBufferFlush(): void {
    if (this.bufferFlushInterval) return;

    this.bufferFlushInterval = setInterval(() => {
      if (this.priceBuffer.size > 0 && this.onBatchPriceUpdate) {
        const updates = Array.from(this.priceBuffer.values());
        this.onBatchPriceUpdate(updates);
        this.priceBuffer.clear();
      }
    }, this.BUFFER_FLUSH_MS);
  }

  /** Replace the price update callback (useful when closures become stale) */
  setPriceCallback(cb: (update: PriceUpdate) => void): void {
    this.onPriceUpdate = cb;
  }

  /** Add more scrips to active subscription */
  addSubscriptions(newScrips: string[]): void {
    const toAdd = newScrips.filter((s) => !this.subscribedScrips.has(s));
    if (toAdd.length === 0) return;
    toAdd.forEach((s) => this.subscribedScrips.add(s));

    if (this.mode === 'websocket' && this.ws && this.ws.readyState === 1) {
      this.subscribeToScrips(toAdd);
    }
  }

  /** Remove scrips from subscription */
  removeSubscriptions(scrips: string[]): void {
    scrips.forEach((s) => this.subscribedScrips.delete(s));

    if (this.mode === 'websocket' && this.ws && this.ws.readyState === 1) {
      const msg = { type: 'us', scrips: scrips.join('&'), channelnum: this.CHANNEL_NUM };
      this.ws.send(JSON.stringify(msg));
      console.log('[WebSocket-HSM] 📤 Unsubscribed:', scrips.join('&'));
    }
  }

  /** Get latest buffered price for a scrip key */
  getLatestPrice(scripKey: string): PriceUpdate | null {
    return this.priceBuffer.get(scripKey) || null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === 1;
  }

  getStatus() {
    return {
      isConnected: this.isConnected(),
      isActive: this.isActive,
      mode: this.mode,
      reconnectAttempts: this.reconnectAttempts,
      subscribedScrips: this.subscribedScrips.size,
    };
  }

  /** Disconnect and clean up */
  disconnect(): void {
    console.log('[MarketDataStreamService] Disconnecting...');
    this.isActive = false;
    this.stopHeartbeat();

    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }

    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }

    if (this.isPollingActive) {
      import('./DynamicPollingService').then(({ getDynamicPollingService }) => {
        getDynamicPollingService().stopPolling();
      });
      this.isPollingActive = false;
    }

    this.subscribedScrips.clear();
    this.priceBuffer.clear();
    this.onPriceUpdate = null;
    this.onBatchPriceUpdate = undefined;
  }
}

// Singleton instance
let instance: MarketDataStreamService | null = null;

/**
 * Get or create MarketDataStreamService instance
 */
export function getMarketDataStreamService(): MarketDataStreamService {
  if (!instance) {
    instance = new MarketDataStreamService();
  }
  return instance;
}

/**
 * Reset service instance (mainly for testing)
 */
export function resetMarketDataStreamService(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}
