/**
 * Kotak Neo WebSocket SDK Type Definitions & Utilities
 * 
 * The SDK (hslib.js) exposes the HSWebSocket class globally
 * Uses window.HSWebSocket for WebSocket connections
 */

declare global {
  interface Window {
    HSWebSocket: any;
    HSIWebSocket: any;
  }
}

/**
 * Check if Neo SDK is loaded and available
 */
export function isNeoSDKLoaded(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.HSWebSocket === 'function';
}

/**
 * Get HSWebSocket class - throws error if not loaded
 */
export function getHSWebSocket() {
  if (!isNeoSDKLoaded()) {
    throw new Error(
      'Kotak Neo SDK (hslib.js) not loaded. Ensure Script tags in layout.tsx are loading /kotak-neo-sdk/hslib.js'
    );
  }
  return window.HSWebSocket;
}

/**
 * Get HSIWebSocket class if available
 */
export function getHSIWebSocket() {
  if (typeof window.HSIWebSocket !== 'function') {
    throw new Error('HSIWebSocket not available. Check SDK loading.');
  }
  return window.HSIWebSocket;
}

/**
 * Wait for Neo SDK to load with timeout
 */
export async function waitForNeoSDK(timeoutMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (isNeoSDKLoaded()) {
      console.log('✅ [Neo SDK] HSWebSocket loaded and ready');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.error('❌ [Neo SDK] Timeout waiting for SDK to load');
  return false;
}

/**
 * Get SDK status information
 */
export function getNeoSDKStatus() {
  return {
    loaded: isNeoSDKLoaded(),
    hsWebSocketAvailable: typeof window?.HSWebSocket === 'function',
    hsiWebSocketAvailable: typeof window?.HSIWebSocket === 'function',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log SDK initialization status
 */
export function logNeoSDKStatus(): void {
  const status = getNeoSDKStatus();
  console.group('🔧 Kotak Neo SDK Status');
  console.log('Loaded:', status.loaded);
  console.log('HSWebSocket:', status.hsWebSocketAvailable ? '✅ Available' : '❌ Missing');
  console.log('HSIWebSocket:', status.hsiWebSocketAvailable ? '✅ Available' : '❌ Missing');
  console.log('Timestamp:', status.timestamp);
  console.groupEnd();
}

export default {
  isNeoSDKLoaded,
  getHSWebSocket,
  getHSIWebSocket,
  waitForNeoSDK,
  getNeoSDKStatus,
  logNeoSDKStatus,
};
