// src/app/debug/page.tsx
'use client';

import { useState } from 'react';
import { KotakAuthService } from '@/lib/services/KotakAuthService';

export default function DebugPage() {
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testAuth = async () => {
    try {
      setLoading(true);
      setOutput('Testing KotakAuthService initialization...\n');

      const consumerKey = 'c63d7961-e935-4bce-8183-c63d9d2342f0';
      const mobileNumber = '+916375922829';
      const ucc = 'V2Q1T';

      setOutput((prev) => prev + `Credentials:\n`);
      setOutput((prev) => prev + `- consumerKey: ${consumerKey.substring(0, 10)}...\n`);
      setOutput((prev) => prev + `- mobileNumber: ${mobileNumber}\n`);
      setOutput((prev) => prev + `- ucc: ${ucc}\n\n`);

      const service = new KotakAuthService({
        consumerKey,
        mobileNumber,
        ucc,
      });

      setOutput((prev) => prev + '✅ KotakAuthService initialized successfully!\n');
      setOutput((prev) => prev + 'Ready for TOTP validation\n\n');
      setOutput((prev) => prev + 'Next: Enter TOTP from your authenticator app\n');
    } catch (error) {
      setOutput((prev) => prev + `❌ Error: ${error instanceof Error ? error.message : error}\n`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen font-mono">
      <h1 className="text-2xl font-bold mb-4">🔐 Auth Debug</h1>

      <button
        onClick={testAuth}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded mb-4"
      >
        {loading ? 'Testing...' : 'Test Auth Service'}
      </button>

      <div className="bg-gray-800 p-4 rounded text-sm whitespace-pre-wrap font-mono">
        {output || 'Click "Test Auth Service" to start'}
      </div>
    </div>
  );
}
