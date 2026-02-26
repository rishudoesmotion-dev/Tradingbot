/**
 * Scrip Master Sync Component
 * Syncs instrument master data from Kotak to Supabase
 * Only syncs once per day
 */

'use client';

import { useState, useEffect } from 'react';
import { Database, Loader, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface SyncStatus {
  isSynced: boolean;
  totalRecords: number;
  lastSync?: {
    synced_at: string;
    total_records: number;
  };
}

const KOTAK_CONSUMER_KEY = 'c63d7961-e935-4bce-8183-c63d9d2342f0';
const LAST_SYNC_TIME_KEY = 'kotak_scrip_last_sync_time';
const SYNC_INTERVAL_HOURS = 24;

export default function ScripMasterSync() {
  const [status, setStatus] = useState<SyncStatus>({ isSynced: false, totalRecords: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [canSync, setCanSync] = useState(true);
  const [nextSyncTime, setNextSyncTime] = useState<Date | null>(null);

  // Check sync status and connection on mount
  useEffect(() => {
    checkStatus();
    checkConnection();
    checkSyncEligibility();
    // Auto-sync on mount if eligible
    autoSync();
  }, []);

  const checkConnection = () => {
    const storedAuth = localStorage.getItem('kotak_session');
    setIsConnected(!!storedAuth);
  };

  const checkSyncEligibility = () => {
    const lastSyncTimeStr = localStorage.getItem(LAST_SYNC_TIME_KEY);
    if (!lastSyncTimeStr) {
      setCanSync(true);
      return;
    }

    const lastSyncTime = new Date(lastSyncTimeStr);
    const now = new Date();
    const hoursSinceLastSync = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastSync >= SYNC_INTERVAL_HOURS) {
      setCanSync(true);
    } else {
      setCanSync(false);
      const nextSync = new Date(lastSyncTime.getTime() + SYNC_INTERVAL_HOURS * 60 * 60 * 1000);
      setNextSyncTime(nextSync);
    }
  };

  const autoSync = async () => {
    const lastSyncTimeStr = localStorage.getItem(LAST_SYNC_TIME_KEY);
    if (!lastSyncTimeStr) {
      // First time, auto-sync
      await handleSync(false);
    }
  };

  const checkStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/kotak/scrip/sync');
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async (fullSync: boolean = false) => {
    try {
      setIsSyncing(true);
      setError(null);

      // Get trading credentials from localStorage
      const storedAuth = localStorage.getItem('kotak_session');
      if (!storedAuth) {
        throw new Error('Not connected to Kotak. Please login first.');
      }

      const authSession = JSON.parse(storedAuth);
      console.log('📋 Auth session structure:', Object.keys(authSession));
      
      // Try different property name combinations
      const token = authSession.tradingToken || authSession.sessionToken || authSession.token;
      const sid = authSession.tradingSid || authSession.sid || authSession.sidTrade;
      const baseUrl = authSession.baseUrl;
      
      if (!token || !sid) {
        console.error('Missing credentials:', { token: !!token, sid: !!sid });
        console.error('Available properties:', Object.keys(authSession));
        throw new Error(`Trading credentials missing. Session has: ${Object.keys(authSession).join(', ')}`);
      }

      const payload: any = {
        consumerKey: KOTAK_CONSUMER_KEY,
        tradingToken: token,
        tradingSid: sid,
        fullSync,
      };

      // Include baseUrl if available (from successful login)
      if (baseUrl) {
        payload.baseUrl = baseUrl;
        console.log('📍 Using baseUrl from session:', baseUrl);
      }

      const response = await fetch('/api/kotak/scrip/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      setSyncResult(data);
      
      // Record sync time
      localStorage.setItem(LAST_SYNC_TIME_KEY, new Date().toISOString());
      setCanSync(false);
      
      // Set next sync time
      const nextSync = new Date(Date.now() + SYNC_INTERVAL_HOURS * 60 * 60 * 1000);
      setNextSyncTime(nextSync);

      await checkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Scrip Master Data</h3>
            
            {isLoading ? (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Loader className="w-3 h-3 animate-spin" />
                Checking status...
              </p>
            ) : status.isSynced ? (
              <div className="mt-1">
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Synced - {status.totalRecords.toLocaleString()} instruments
                </p>
                {status.lastSync && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Last sync: {new Date(status.lastSync.synced_at).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Not synced - Data search will not work
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {isConnected && canSync && (
            <button
              onClick={() => handleSync(true)}
              disabled={isSyncing || isLoading}
              className={`px-3 py-1.5 text-xs font-medium rounded transition flex items-center gap-1 ${
                status.isSynced
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              } disabled:opacity-50`}
              title="Sync instruments from Kotak API"
            >
              {isSyncing ? (
                <>
                  <Loader className="w-3 h-3 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3" />
                  Sync Now
                </>
              )}
            </button>
          )}

          {isConnected && !canSync && nextSyncTime && (
            <p className="text-xs text-gray-500">
              Next sync in {Math.ceil((nextSyncTime.getTime() - Date.now()) / (1000 * 60))} min
            </p>
          )}

          {!isConnected && (
            <p className="text-xs text-gray-500">
              💡 Login first to sync
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <p className="font-medium">❌ Error: {error}</p>
          {error.includes('Not connected') && (
            <p className="mt-2 text-xs text-red-600">
              💡 You need to <strong>login first</strong> to sync instrument data from Kotak API.
            </p>
          )}
          {error.includes('table not found') && (
            <p className="mt-2 text-xs text-red-600">
              💡 <strong>Setup required:</strong> Create the Supabase tables first. See SUPABASE_SETUP_GUIDE.md in the project root.
            </p>
          )}
          {error.includes('Network error') && (
            <p className="mt-2 text-xs text-red-600">
              💡 Check your internet connection.
            </p>
          )}
          {error.includes('Supabase not configured') && (
            <p className="mt-2 text-xs text-red-600">
              💡 Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file
            </p>
          )}
        </div>
      )}

      {syncResult && (
        <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
          <p className="font-medium">{syncResult.message}</p>
          <p className="mt-1">Total records synced: {syncResult.totalRecords.toLocaleString()}</p>
          {syncResult.breakdown && Object.entries(syncResult.breakdown).map(([segment, count]) => (
            <p key={segment} className="text-xs mt-0.5">
              {segment}: {(count as number).toLocaleString()} records
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
