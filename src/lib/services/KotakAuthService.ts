// src/lib/services/KotakAuthService.ts
/**
 * Kotak Neo Authentication Service
 * 
 * Handles the two-step authentication process:
 * 1. TOTP Validation (Step 2a)
 * 2. MPIN Validation (Step 2b)
 * 
 * Flow:
 * - User enters TOTP from authenticator app → Receive VIEW_TOKEN and VIEW_SID
 * - User enters MPIN → Receive TRADING_TOKEN, TRADING_SID, and BASE_URL
 * - Ready to make trading API calls
 */

export interface KotakAuthConfig {
  consumerKey: string;
  mobileNumber: string;
  ucc: string;
  baseUrl?: string;
}

export interface KotakAuthStep1Response {
  viewToken: string;
  viewSid: string;
  kType: 'View';
  status: 'success';
}

export interface KotakAuthStep2Response {
  tradingToken: string;
  tradingSid: string;
  baseUrl: string;
  kType: 'Trade';
  status: 'success';
}

export interface KotakAuthSession {
  tradingToken: string;
  tradingSid: string;
  baseUrl: string;
  viewToken?: string;
  viewSid?: string;
  timestamp: number;
  isValid: boolean;
}

export class KotakAuthService {
  private readonly API_BASE_LOGIN = 'https://mis.kotaksecurities.com';
  private readonly NEO_FIN_KEY = 'neotradeapi';
  private config: KotakAuthConfig;
  private session: KotakAuthSession | null = null;

  constructor(config: KotakAuthConfig) {
    console.log('🔐 KotakAuthService config:', {
      consumerKey: config.consumerKey ? `${config.consumerKey.substring(0, 10)}...` : 'MISSING',
      mobileNumber: config.mobileNumber ? config.mobileNumber : 'MISSING',
      ucc: config.ucc ? config.ucc : 'MISSING',
    });

    if (!config.consumerKey || !config.mobileNumber || !config.ucc) {
      throw new Error(
        `Missing required config: ${!config.consumerKey ? 'consumerKey ' : ''}${!config.mobileNumber ? 'mobileNumber ' : ''}${!config.ucc ? 'ucc' : ''}`
      );
    }
    this.config = config;
  }

  /**
   * Step 2a: Validate TOTP
   * Sends mobile number, UCC, and TOTP to get VIEW_TOKEN and VIEW_SID
   * Uses Next.js API proxy to bypass CORS
   */
  async validateTotp(totp: string): Promise<KotakAuthStep1Response> {
    try {
      console.log('📤 Browser → API Proxy: TOTP Request');

      const response = await fetch('/api/kotak/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          step: 'totp',
          consumerKey: this.config.consumerKey,
          mobileNumber: this.config.mobileNumber,
          ucc: this.config.ucc,
          totp: totp,
        }),
      });

      console.log('📥 API Response Status:', response.status, response.statusText);

      const data = await response.json();
      console.log('📥 API Response Data:', data);

      if (!response.ok) {
        throw new Error(
          `TOTP validation failed (${response.status}): ${response.statusText}\n` +
          `Response: ${JSON.stringify(data)}\n` +
          `Possible issues:\n` +
          `- Invalid TOTP code (must be current, valid for ~30 seconds)\n` +
          `- Incorrect mobile number or UCC\n` +
          `- Check your authenticator app for correct 6-digit code`
        );
      }

      if (!data?.data?.viewToken || !data?.data?.viewSid) {
        throw new Error('Invalid TOTP response - missing viewToken or viewSid');
      }

      // Store temporary view session
      this.session = {
        viewToken: data.data.viewToken,
        viewSid: data.data.viewSid,
        tradingToken: '',
        tradingSid: '',
        baseUrl: '',
        timestamp: Date.now(),
        isValid: false,
      };

      console.log('✅ TOTP Validation Successful');
      console.log('📋 Received VIEW_TOKEN and VIEW_SID');
      console.log('➡️  Ready for Step 2b: MPIN Validation\n');

      return {
        viewToken: data.data.viewToken,
        viewSid: data.data.viewSid,
        kType: 'View',
        status: 'success',
      };
    } catch (error) {
      console.error('❌ TOTP Validation Error:', error);
      throw error;
    }
  }

  /**
   * Step 2b: Validate MPIN
   * Upgrades view access to trading access
   * Uses Next.js API proxy to bypass CORS
   */
  async validateMpin(mpin: string): Promise<KotakAuthStep2Response> {
    if (!this.session?.viewToken || !this.session?.viewSid) {
      throw new Error(
        'MPIN validation requires prior TOTP validation.\n' +
        'Please complete Step 2a first (validateTotp)'
      );
    }

    try {
      console.log('📤 Browser → API Proxy: MPIN Request');

      const response = await fetch('/api/kotak/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          step: 'mpin',
          consumerKey: this.config.consumerKey,
          viewToken: this.session.viewToken,
          viewSid: this.session.viewSid,
          mpin: mpin,
        }),
      });

      console.log('📥 API Response Status:', response.status, response.statusText);

      const data = await response.json();
      console.log('📥 API Response Data:', data);

      if (!response.ok) {
        throw new Error(
          `MPIN Validation Failed (${response.status}): ${response.statusText}\n` +
          `Response: ${JSON.stringify(data)}\n` +
          `Possible issues:\n` +
          `- Invalid MPIN (6-digit code)\n` +
          `- Session expired - try Step 2a again\n` +
          `- Check server connectivity`
        );
      }

      if (!data?.data?.tradingToken || !data?.data?.tradingSid || !data?.data?.baseUrl) {
        throw new Error('Invalid MPIN response - missing required fields');
      }

      // Store complete trading session
      this.session = {
        tradingToken: data.data.tradingToken,
        tradingSid: data.data.tradingSid,
        baseUrl: data.data.baseUrl,
        viewToken: this.session.viewToken,
        viewSid: this.session.viewSid,
        timestamp: Date.now(),
        isValid: true,
      };

      console.log('✅ Step 2b Complete: MPIN Validated');
      console.log('🎯 Full Trading Access Granted!\n');
      console.log('📊 Session Details:');
      console.log(`  - TRADING_TOKEN: ${data.data.tradingToken.substring(0, 20)}...`);
      console.log(`  - TRADING_SID: ${data.data.tradingSid}`);
      console.log(`  - BASE_URL: ${data.data.baseUrl}\n`);
      console.log('Ready to make trading API calls!\n');

      return {
        tradingToken: data.data.tradingToken,
        tradingSid: data.data.tradingSid,
        baseUrl: data.data.baseUrl,
        kType: 'Trade',
        status: 'success',
      };
    } catch (error) {
      console.error('❌ MPIN Validation Error:', error);
      throw error;
    }
  }

  /**
   * Get current session
   */
  getSession(): KotakAuthSession | null {
    return this.session;
  }

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    return this.session?.isValid ?? false;
  }

  /**
   * Get headers for API calls
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.session?.isValid) {
      throw new Error('Not authenticated. Complete TOTP and MPIN validation first.');
    }

    return {
      'Authorization': this.session.tradingToken,
      'Sid': this.session.tradingSid,
      'neo-fin-key': this.NEO_FIN_KEY,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get base URL for API calls
   */
  getBaseUrl(): string {
    if (!this.session?.baseUrl) {
      throw new Error('Base URL not available. Complete authentication first.');
    }
    return this.session.baseUrl;
  }

  /**
   * Clear session
   */
  clearSession(): void {
    this.session = null;
    console.log('Session cleared');
  }
}

// Singleton instance
let authServiceInstance: KotakAuthService | null = null;

export function getKotakAuthService(config?: KotakAuthConfig): KotakAuthService {
  if (!authServiceInstance && !config) {
    throw new Error('KotakAuthService must be initialized with config first');
  }

  if (config && !authServiceInstance) {
    authServiceInstance = new KotakAuthService(config);
  }

  return authServiceInstance!;
}
