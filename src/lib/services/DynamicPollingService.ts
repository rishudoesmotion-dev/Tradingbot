// src/lib/services/DynamicPollingService.ts

/**
 * Dynamic Polling Service
 * Adjusts polling intervals based on trading position status:
 * - NO POSITIONS: 5000ms (5 seconds)
 * - HAS POSITIONS: 1000ms (1 second)
 * - MARKET CLOSED: 0ms (disabled)
 */

export interface PollingConfig {
  intervalNoPositions: number; // 5000ms
  intervalWithPositions: number; // 1000ms
  minInterval: number; // Don't go below 1s to avoid API rate limits
  maxInterval: number; // Don't exceed this
}

const DEFAULT_CONFIG: PollingConfig = {
  intervalNoPositions: 5000, // 5 seconds
  intervalWithPositions: 1000, // 1 second
  minInterval: 1000, // Minimum 1 second
  maxInterval: 10000, // Maximum 10 seconds
};

export class DynamicPollingService {
  private config: PollingConfig;
  private currentInterval: number;
  private pollingActive: boolean = false;
  private pollingCallback: (() => void) | null = null;
  private pollTimeoutId: NodeJS.Timeout | null = null;

  constructor(config?: Partial<PollingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentInterval = this.config.intervalNoPositions;
  }

  /**
   * Start polling with adaptive intervals
   * @param callback Function to call on each poll tick
   * @param hasPositions Whether user currently has open positions
   */
  startPolling(callback: () => void, hasPositions: boolean = false): void {
    if (this.pollingActive) {
      console.warn('[DynamicPolling] Already polling');
      return;
    }

    this.pollingCallback = callback;
    this.pollingActive = true;
    this.updateInterval(hasPositions);

    console.log(`[DynamicPolling] ✅ Started polling with ${this.currentInterval}ms interval`);
    this.scheduleNextPoll();
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
    this.pollingActive = false;
    this.pollingCallback = null;
    console.log('[DynamicPolling] ⏹️ Stopped polling');
  }

  /**
   * Update polling interval based on position status
   * Call this whenever position count changes
   */
  updatePositionStatus(hasPositions: boolean): void {
    const oldInterval = this.currentInterval;
    this.updateInterval(hasPositions);

    if (oldInterval !== this.currentInterval && this.pollingActive) {
      console.log(
        `[DynamicPolling] 📊 Interval adjusted: ${oldInterval}ms → ${this.currentInterval}ms (positions: ${hasPositions})`
      );
      // Don't need to reschedule - next poll will use new interval
    }
  }

  /**
   * Get current polling interval in milliseconds
   */
  getInterval(): number {
    return this.currentInterval;
  }

  /**
   * Check if polling is active
   */
  isActive(): boolean {
    return this.pollingActive;
  }

  /**
   * Force immediate poll (useful for manual refresh)
   */
  forcePoll(): void {
    if (!this.pollingActive) {
      console.warn('[DynamicPolling] Not polling - cannot force poll');
      return;
    }

    console.log('[DynamicPolling] 🔄 Forced immediate poll');
    if (this.pollingCallback) {
      this.pollingCallback();
    }
  }

  /**
   * Get polling status info
   */
  getStatus(): {
    active: boolean;
    interval: number;
    intervalSeconds: number;
  } {
    return {
      active: this.pollingActive,
      interval: this.currentInterval,
      intervalSeconds: this.currentInterval / 1000,
    };
  }

  /**
   * Private: Update interval based on position status
   */
  private updateInterval(hasPositions: boolean): void {
    const newInterval = hasPositions
      ? this.config.intervalWithPositions
      : this.config.intervalNoPositions;

    // Clamp interval between min and max
    this.currentInterval = Math.max(
      this.config.minInterval,
      Math.min(newInterval, this.config.maxInterval)
    );
  }

  /**
   * Private: Schedule next poll
   */
  private scheduleNextPoll(): void {
    if (!this.pollingActive) return;

    this.pollTimeoutId = setTimeout(() => {
      if (this.pollingCallback && this.pollingActive) {
        this.pollingCallback();
      }
      // Schedule next poll with potentially updated interval
      this.scheduleNextPoll();
    }, this.currentInterval);
  }

  /**
   * Set custom config at runtime
   */
  setConfig(config: Partial<PollingConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[DynamicPolling] ⚙️ Config updated:', this.config);
  }

  /**
   * Get current config
   */
  getConfig(): PollingConfig {
    return { ...this.config };
  }
}

// Singleton instance
let dynamicPollingService: DynamicPollingService | null = null;

/**
 * Get or create singleton instance
 */
export const getDynamicPollingService = (): DynamicPollingService => {
  if (!dynamicPollingService) {
    dynamicPollingService = new DynamicPollingService();
  }
  return dynamicPollingService;
};
