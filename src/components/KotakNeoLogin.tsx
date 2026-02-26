'use client';

import { useState } from 'react';
import { KotakAuthService } from '@/lib/services/KotakAuthService';
import { AlertCircle, CheckCircle, Clock, Loader, Lock } from 'lucide-react';

interface LoginStep {
  step: 'totp' | 'mpin' | 'success' | 'error';
  message: string;
}

export default function KotakNeoLogin({
  onSuccess,
}: {
  onSuccess?: (session: any) => void;
}) {
  const [totp, setTotp] = useState('');
  const [mpin, setMpin] = useState('');

  const [currentStep, setCurrentStep] = useState<LoginStep>({
    step: 'totp',
    message: '📱 Enter your 6-digit TOTP from authenticator app',
  });

  const [authService, setAuthService] = useState<KotakAuthService | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTotpSubmit = async () => {
    if (!totp.trim() || totp.length !== 6 || isNaN(Number(totp))) {
      setCurrentStep({
        step: 'error',
        message: '❌ TOTP must be exactly 6 digits',
      });
      return;
    }

    try {
      setLoading(true);
      
      // Get credentials from environment or use hardcoded values
      const consumerKey = 'c63d7961-e935-4bce-8183-c63d9d2342f0';
      const mobileNumber = '+916375922829';
      const ucc = 'V2Q1T';

      const service = new KotakAuthService({
        consumerKey,
        mobileNumber,
        ucc,
      });

      await service.validateTotp(totp.trim());
      setAuthService(service);

      setCurrentStep({
        step: 'mpin',
        message: '🔐 Enter your 6-digit MPIN to complete authentication',
      });
      setTotp('');
    } catch (error) {
      setCurrentStep({
        step: 'error',
        message: `❌ ${error instanceof Error ? error.message : 'TOTP validation failed'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMpinSubmit = async () => {
    if (!mpin.trim() || mpin.length !== 6 || isNaN(Number(mpin))) {
      setCurrentStep({
        step: 'error',
        message: '❌ MPIN must be exactly 6 digits',
      });
      return;
    }

    if (!authService) {
      return;
    }

    try {
      setLoading(true);
      const response = await authService.validateMpin(mpin.trim());

      const headers = authService.getAuthHeaders();

      setCurrentStep({
        step: 'success',
        message: '🎉 Authentication Successful!',
      });

      if (onSuccess) {
        onSuccess({
          tradingToken: response.tradingToken,
          tradingSid: response.tradingSid,
          baseUrl: response.baseUrl,
          headers,
        });
      }
    } catch (error) {
      setCurrentStep({
        step: 'error',
        message: `❌ ${error instanceof Error ? error.message : 'MPIN validation failed'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleError = () => {
    setCurrentStep({
      step: 'totp',
      message: '📱 Enter your 6-digit TOTP from authenticator app',
    });
    setTotp('');
    setMpin('');
    setAuthService(null);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Lock size={28} />
            Kotak Neo Login
          </h1>
          <p className="text-blue-100 text-sm mt-1">Quick authentication</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* TOTP Input */}
          {currentStep.step === 'totp' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <Clock className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                  <p className="font-semibold text-blue-900">Step 1: TOTP Validation</p>
                  <p className="text-blue-700 text-xs mt-1">
                    Open your authenticator app and enter the 6-digit code
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  TOTP Code (6 digits)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-mono text-3xl tracking-widest"
                  disabled={loading}
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-2 text-xs text-amber-600">
                  <Clock size={14} />
                  Code expires in ~30 seconds
                </div>
              </div>

              <button
                onClick={handleTotpSubmit}
                disabled={loading || totp.length !== 6}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader size={18} className="animate-spin" />}
                {loading ? 'Validating...' : 'Validate TOTP'}
              </button>
            </div>
          )}

          {/* MPIN Input */}
          {currentStep.step === 'mpin' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <Lock className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                  <p className="font-semibold text-green-900">Step 2: MPIN Validation</p>
                  <p className="text-green-700 text-xs mt-1">
                    Enter your MPIN to get full trading access
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  MPIN (6 digits)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={mpin}
                  onChange={(e) => setMpin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-mono text-3xl tracking-widest"
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button
                onClick={handleMpinSubmit}
                disabled={loading || mpin.length !== 6}
                className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader size={18} className="animate-spin" />}
                {loading ? 'Validating...' : 'Validate MPIN'}
              </button>
            </div>
          )}

          {/* Success */}
          {currentStep.step === 'success' && (
            <div className="space-y-4 text-center">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5 mx-auto" size={24} />
              </div>
              <div>
                <p className="font-semibold text-green-900 text-lg">Authentication Successful</p>
                <p className="text-green-700 text-xs mt-1">Full trading access granted</p>
              </div>
            </div>
          )}

          {/* Error */}
          {currentStep.step === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={24} />
                <div className="text-sm">
                  <p className="font-semibold text-red-900">Authentication Error</p>
                  <p className="text-red-700 text-xs mt-1 whitespace-pre-wrap">
                    {currentStep.message}
                  </p>
                </div>
              </div>

              <button
                onClick={handleError}
                className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
          <p className="text-xs text-gray-600 text-center">
            {currentStep.step === 'totp' && '⏱️ Code valid for ~30 seconds'}
            {currentStep.step === 'mpin' && '🔐 Keep your MPIN secure'}
            {currentStep.step === 'success' && '✨ Ready for trading'}
            {currentStep.step === 'error' && '⚠️ Please resolve the error above'}
          </p>
        </div>
      </div>
    </div>
  );
}
