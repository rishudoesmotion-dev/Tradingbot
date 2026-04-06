'use client';

import { useState, useEffect } from 'react';
import Dashboard from '@/components/Dashboard';
import TradingPanel from '@/components/TradingPanel';
import KotakNeoLogin from '@/components/KotakNeoLogin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, LogIn } from 'lucide-react';

const SESSION_STORAGE_KEY = 'kotak_session';

/**
 * Helper: set cookie
 */
function setCookie(name: string, value: string, days = 1) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Helper: delete cookie
 */
function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Restore session from localStorage on mount
   */
  useEffect(() => {
    try {
      const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (storedSession) {
        const session = JSON.parse(storedSession);
        console.log('✅ Session restored from localStorage');
        setSessionInfo(session);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * On successful login
   */
  const handleAuthSuccess = (session: any) => {
    console.log('💾 Storing session to localStorage + cookies');

    // Save to localStorage
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

    // Save to cookie (for server/API routes)
    setCookie('kotak_session', JSON.stringify(session), 1);

    setSessionInfo(session);
    setIsAuthenticated(true);
    setShowLogin(false);
  };

  /**
   * Logout
   */
  const handleLogout = () => {
    console.log('🗑️ Clearing session from localStorage + cookies');

    localStorage.removeItem(SESSION_STORAGE_KEY);
    deleteCookie('kotak_session');

    setIsAuthenticated(false);
    setSessionInfo(null);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600">Loading session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-blue-50">
      <div className="container mx-auto p-4">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Trading Terminal</h1>
              <p className="text-gray-600 mt-1">Kotak Neo Securities API Integration</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700">
                  {isAuthenticated ? '✅ Connected' : '⚪ Not Connected'}
                </p>
                <p className="text-xs text-gray-500">
                  {isAuthenticated ? 'Ready to trade' : 'Connect to start trading'}
                </p>
              </div>

              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition text-sm"
                >
                  Logout
                </button>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center gap-2 text-sm"
                >
                  <LogIn size={16} />
                  Login
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 size={16} />
              Dashboard
            </TabsTrigger>

            <TabsTrigger
              value="trading"
              disabled={!isAuthenticated}
              className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp size={16} />
              Trading
            </TabsTrigger>
          </TabsList>

          {/* Dashboard */}
          <TabsContent value="dashboard" className="mt-6">
            <Dashboard isAuthenticated={isAuthenticated} />
          </TabsContent>

          {/* Trading */}
          <TabsContent value="trading" className="mt-6">
            {isAuthenticated ? (
              <TradingPanel
                sessionInfo={sessionInfo}
                onSessionExpired={() => {
                  handleLogout();
                  setShowLogin(true);
                }}
              />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Login Required
                </h3>
                <p className="text-gray-600 mb-4">
                  Click the Login button to authenticate with Kotak Neo
                </p>
                <button
                  onClick={() => setShowLogin(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                >
                  Go to Login
                </button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative">
            <button
              onClick={() => setShowLogin(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition"
            >
              ✕ Close
            </button>
            <KotakNeoLogin onSuccess={handleAuthSuccess} />
          </div>
        </div>
      )}
    </main>
  );
}