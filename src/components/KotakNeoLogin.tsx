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
      
      // Get credentials from environment
      const consumerKey = process.env.NEXT_PUBLIC_KOTAK_CONSUMER_KEY || 'c63d7961-e935-4bce-8183-c63d9d2342f0';
      const mobileNumber = process.env.NEXT_PUBLIC_KOTAK_MOBILE_NUMBER || '+916375922829';
      const ucc = process.env.NEXT_PUBLIC_KOTAK_UCC || 'V2Q1T';
      const mpin = process.env.NEXT_PUBLIC_KOTAK_MPIN || '';

      if (!mpin) {
        setCurrentStep({
          step: 'error',
          message: '❌ MPIN not configured in environment',
        });
        return;
      }

      const service = new KotakAuthService({
        consumerKey,
        mobileNumber,
        ucc,
      });

      await service.validateTotp(totp.trim());
      setAuthService(service);

      // Auto-validate MPIN without user input
      setCurrentStep({
        step: 'mpin',
        message: '🔐 Validating MPIN automatically...',
      });
      setTotp('');

      // Automatically submit MPIN after brief delay
      setTimeout(() => {
        completeMpinValidation(service, mpin, consumerKey);
      }, 500);
    } catch (error) {
      setCurrentStep({
        step: 'error',
        message: `❌ ${error instanceof Error ? error.message : 'TOTP validation failed'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const completeMpinValidation = async (service: KotakAuthService, mpin: string, consumerKey: string) => {
    try {
      setLoading(true);
      const response = await service.validateMpin(mpin);
      const headers = service.getAuthHeaders();

      setCurrentStep({
        step: 'success',
        message: '🎉 Authentication Successful!',
      });

      if (onSuccess) {
        onSuccess({
          tradingToken: response.tradingToken,
          tradingSid: response.tradingSid,
          baseUrl: response.baseUrl,
          consumerKey,
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

          {/* MPIN Auto-Validation */}
          {currentStep.step === 'mpin' && (
            <div className="space-y-4 text-center">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <Lock className="text-amber-600 flex-shrink-0 mt-0.5 mx-auto" size={24} />
              </div>
              <div>
                <p className="font-semibold text-amber-900 text-lg">Validating MPIN</p>
                <p className="text-amber-700 text-xs mt-1">Please wait...</p>
              </div>
              <div className="flex justify-center">
                <Loader size={32} className="animate-spin text-amber-600" />
              </div>
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
