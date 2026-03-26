/**
 * SDK Initialization Script
 * Ensures window.Neo and window.HSLib are properly exposed
 * This runs after the SDK files are loaded
 */

(function() {
  // Wait for SDK to be available
  const checkSDK = setInterval(() => {
    if (typeof window !== 'undefined') {
      // Check if Neo SDK is loaded
      if (typeof window.Neo !== 'undefined' || typeof window.HSLib !== 'undefined') {
        console.log('✅ [SDK Init] Kotak Neo SDK detected');
        clearInterval(checkSDK);
      }
    }
  }, 100);

  // Also log immediately if available
  if (typeof window.Neo !== 'undefined') {
    console.log('✅ [SDK Init] window.Neo is available');
  }
  if (typeof window.HSLib !== 'undefined') {
    console.log('✅ [SDK Init] window.HSLib is available');
  }
})();
