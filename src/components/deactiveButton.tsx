'use client';

import { useState } from 'react';
import { ShieldOff, AlertTriangle, Loader2, X } from 'lucide-react';
import { getTradesService } from '@/lib/services/TradesService';

interface DeactivateTradingButtonProps {
  /** Called after Supabase is successfully updated so the parent can re-fetch status */
  onDeactivated: () => void;
}

export default function DeactivateTradingButton({ onDeactivated }: DeactivateTradingButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason]           = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const handleDeactivate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const tradesService = getTradesService();
      const result = await tradesService.deactivateTrading(reason.trim() || 'Manually disabled from dashboard');
      if (result.success) {
        setShowConfirm(false);
        setReason('');
        onDeactivated();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Unexpected error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* ── Deactivate button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setShowConfirm(true)}
        className="
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
          border border-red-200 text-red-600 bg-red-50
          hover:bg-red-100 hover:border-red-300
          active:scale-95 transition-all duration-150
        "
        title="Disable trading for today — can only be re-enabled from Supabase"
      >
        <ShieldOff size={13} />
        Deactivate
      </button>

      {/* ── Confirmation modal ────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

            {/* Header */}
            <div className="bg-red-600 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-white" />
                  <span className="text-white font-bold text-sm tracking-wide">
                    Deactivate Trading
                  </span>
                </div>
                <button
                  onClick={() => { setShowConfirm(false); setReason(''); setError(null); }}
                  className="text-white/70 hover:text-white transition"
                  disabled={submitting}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-red-100 text-xs mt-1.5 leading-relaxed">
                This will disable all order placement for today.
              </p>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">

              {/* Warning box */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
                <p className="text-amber-800 text-xs font-semibold">⚠ This action cannot be undone from the dashboard.</p>
                <p className="text-amber-700 text-xs">
                  To re-enable trading, you must manually set{' '}
                  <code className="bg-amber-100 px-1 rounded font-mono">is_enabled = true</code>{' '}
                  in the <span className="font-semibold">trading_enabled</span> table in Supabase.
                </p>
              </div>

              {/* Optional reason */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                  Reason <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Hit daily loss limit, volatile market..."
                  disabled={submitting}
                  className="
                    w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900
                    placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-red-400
                    focus:border-transparent disabled:opacity-50 transition
                  "
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowConfirm(false); setReason(''); setError(null); }}
                disabled={submitting}
                className="py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={submitting}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-bold text-white flex items-center justify-center gap-2 transition disabled:opacity-60 active:scale-95"
              >
                {submitting && <Loader2 size={13} className="animate-spin" />}
                {submitting ? 'Disabling…' : 'Yes, Deactivate'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}