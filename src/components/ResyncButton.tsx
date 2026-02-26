'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react';

interface ResyncStatus {
  isLoading: boolean;
  success: boolean;
  error: string | null;
  totalRecords: number;
  breakdown: Record<string, number> | null;
}

export default function ResyncButton() {
  const [status, setStatus] = useState<ResyncStatus>({
    isLoading: false,
    success: false,
    error: null,
    totalRecords: 0,
    breakdown: null,
  });
  const [showResult, setShowResult] = useState(false);

  const handleResync = async () => {
    try {
      setStatus({
        isLoading: true,
        success: false,
        error: null,
        totalRecords: 0,
        breakdown: null,
      });
      setShowResult(true);

      // Get trading credentials from localStorage
      const storedAuth = localStorage.getItem('kotak_session');
      if (!storedAuth) {
        throw new Error('Not connected to Kotak. Please login first.');
      }

      const authSession = JSON.parse(storedAuth);
      const token = authSession.tradingToken || authSession.sessionToken || authSession.token;
      const sid = authSession.tradingSid || authSession.sid || authSession.sidTrade;
      const baseUrl = authSession.baseUrl;

      if (!token || !sid) {
        throw new Error('Trading credentials missing. Please login again.');
      }

      console.log('🔄 Starting resync...');

      const response = await fetch('/api/kotak/scrip/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consumerKey: 'c63d7961-e935-4bce-8183-c63d9d2342f0',
          tradingToken: token,
          tradingSid: sid,
          baseUrl,
          fullSync: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Resync failed');
      }

      // Update sync time
      localStorage.setItem('kotak_scrip_last_sync_time', new Date().toISOString());

      setStatus({
        isLoading: false,
        success: true,
        error: null,
        totalRecords: data.totalRecords,
        breakdown: data.breakdown,
      });

      console.log('✅ Resync complete!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Resync failed';
      setStatus({
        isLoading: false,
        success: false,
        error: errorMessage,
        totalRecords: 0,
        breakdown: null,
      });
      console.error('❌ Resync error:', err);
    }
  };

  return (
    <div className="space-y-3">
      {/* Resync Button */}
      <button
        onClick={handleResync}
        disabled={status.isLoading}
        className={`w-full px-4 py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
          status.isLoading
            ? 'bg-blue-100 text-blue-700 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
        }`}
      >
        <RefreshCw size={18} className={status.isLoading ? 'animate-spin' : ''} />
        {status.isLoading ? 'Resyncing...' : 'Resync Scrip Data'}
      </button>

      {/* Result Message */}
      {showResult && (
        <div
          className={`rounded-lg p-4 border ${
            status.success
              ? 'bg-green-50 border-green-200'
              : status.error
              ? 'bg-red-50 border-red-200'
              : 'bg-blue-50 border-blue-200'
          }`}
        >
          {status.isLoading && (
            <div className="flex items-start gap-3">
              <Loader size={20} className="text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
              <div>
                <p className="font-semibold text-blue-900">Resyncing...</p>
                <p className="text-sm text-blue-700 mt-1">
                  Fetching scrip data from Kotak. This may take 2-5 minutes...
                </p>
              </div>
            </div>
          )}

          {status.success && (
            <div>
              <div className="flex items-start gap-3">
                <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-900">Resync Successful! ✅</p>
                  <p className="text-sm text-green-700 mt-1">
                    {status.totalRecords.toLocaleString()} instruments synced
                  </p>

                  {status.breakdown && Object.keys(status.breakdown).length > 0 && (
                    <div className="mt-3 bg-white rounded border border-green-200 p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-2">By Segment:</p>
                      <div className="space-y-1">
                        {Object.entries(status.breakdown).map(([segment, count]) => (
                          count > 0 && (
                            <div key={segment} className="flex justify-between text-xs">
                              <span className="text-gray-600">{segment}</span>
                              <span className="font-semibold text-gray-900">
                                {count.toLocaleString()}
                              </span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-green-600 mt-3">
                    You can now search for stocks with readable names like "NIFTY 25JAN25 100 PE"
                  </p>
                </div>
              </div>
            </div>
          )}

          {status.error && (
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">Resync Failed ❌</p>
                <p className="text-sm text-red-700 mt-1">{status.error}</p>

                <div className="mt-3 text-xs text-red-600 space-y-1">
                  <p>💡 <strong>Try:</strong></p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>Make sure you are logged in to Kotak</li>
                    <li>Check your internet connection</li>
                    <li>Log in again and try resync</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
