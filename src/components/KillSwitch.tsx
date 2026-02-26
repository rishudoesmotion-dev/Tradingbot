'use client';

import { useState } from 'react';
import { useTradingStore } from '@/store/tradingStore';
import { AlertTriangle, Loader } from 'lucide-react';

export default function KillSwitch() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { positions, activateKillSwitch } = useTradingStore();

  const handleExitAll = async () => {
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      await activateKillSwitch();
      setSuccess('All positions closed successfully!');
      setShowConfirm(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to exit positions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white border border-red-200 rounded-lg shadow">
      <div className="flex items-center gap-3 mb-3">
        <AlertTriangle size={24} className="text-red-600" />
        <h3 className="text-lg font-semibold text-red-700">Kill Switch</h3>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Close all open positions immediately. This action cannot be undone.
      </p>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {!showConfirm ? (
        <button
          onClick={() => {
            if (positions.length === 0) {
              setError('No open positions to close');
              return;
            }
            setShowConfirm(true);
          }}
          disabled={loading || positions.length === 0}
          className={`w-full px-4 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
            positions.length === 0
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
          }`}
        >
          {loading && <Loader size={18} className="animate-spin" />}
          Exit All Positions ({positions.length})
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-semibold text-red-700 mb-2">
              Are you sure? This will close all {positions.length} open position(s).
            </p>
            <p className="text-xs text-red-600">
              Total P&L will be realized immediately.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExitAll}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader size={16} className="animate-spin" />}
              Confirm Exit
            </button>
          </div>
        </div>
      )}

      {positions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600 font-medium mb-2">
            Positions to close:
          </p>
          <div className="space-y-1">
            {positions.slice(0, 3).map((pos) => (
              <div key={pos.symbol} className="flex justify-between text-xs">
                <span className="text-gray-700">{pos.symbol}</span>
                <span className="text-gray-500">
                  Qty: {pos.quantity} @ ₹{pos.ltp.toFixed(2)}
                </span>
              </div>
            ))}
            {positions.length > 3 && (
              <p className="text-xs text-gray-500 pt-1">
                ... and {positions.length - 3} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
