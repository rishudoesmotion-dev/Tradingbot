// src/lib/brokers/BrokerFactory.ts
import { BaseBroker } from './BaseBroker';
import { ShoonyaAdapter } from './ShoonyaAdapter';
import { KotakNeoAdapter } from './KotakNeoAdapter';
import { BrokerCredentials } from '@/types/broker.types';

export enum BrokerType {
  SHOONYA = 'SHOONYA',
  KOTAK_NEO = 'KOTAK_NEO',
  ZERODHA = 'ZERODHA',
  // Add more brokers as needed
}

/**
 * Factory Pattern for creating broker instances
 * This allows easy switching between brokers without changing application code
 */
export class BrokerFactory {
  static createBroker(
    brokerType: BrokerType,
    credentials: BrokerCredentials
  ): BaseBroker {
    switch (brokerType) {
      case BrokerType.SHOONYA:
        return new ShoonyaAdapter(credentials);
      
      case BrokerType.KOTAK_NEO:
        return new KotakNeoAdapter(credentials);
      
      case BrokerType.ZERODHA:
        // return new ZerodhaAdapter(credentials);
        throw new Error('Zerodha adapter not implemented yet');
      
      default:
        throw new Error(`Unsupported broker type: ${brokerType}`);
    }
  }

  static createFromEnv(): BaseBroker {
    const activeBroker = process.env.ACTIVE_BROKER || 'KOTAK_NEO';
    
    console.log('🏭 BrokerFactory.createFromEnv():', { activeBroker });

    // For Kotak Neo
    if (activeBroker === 'KOTAK_NEO') {
      const kotakConfig = {
        mobileNumber: process.env.KOTAK_MOBILE_NUMBER || '',
        ucc: process.env.KOTAK_UCC || '',
        totp: process.env.KOTAK_TOTP || '',
        mpin: process.env.KOTAK_MPIN || '',
      };

      const credentials: BrokerCredentials = {
        userId: process.env.KOTAK_UCC || '',
        apiKey: process.env.KOTAK_CONSUMER_KEY || '',
        apiSecret: JSON.stringify(kotakConfig),
      };

      console.log('🏭 Creating Kotak Neo Adapter with credentials:', {
        userId: credentials.userId ? '✓' : '✗',
        apiKey: credentials.apiKey ? '✓' : '✗',
        apiSecret: credentials.apiSecret ? '✓' : '✗',
      });

      return this.createBroker(BrokerType.KOTAK_NEO, credentials);
    }

    // Fallback to Shoonya (if explicitly set)
    console.log('🏭 Creating Shoonya Adapter');
    const credentials: BrokerCredentials = {
      userId: process.env.SHOONYA_USER_ID || '',
      password: process.env.SHOONYA_PASSWORD || '',
      apiKey: process.env.SHOONYA_API_KEY || '',
      apiSecret: process.env.SHOONYA_API_SECRET || '',
      vendorCode: process.env.SHOONYA_VENDOR_CODE || '',
      imei: process.env.SHOONYA_IMEI || '',
      factor2: process.env.SHOONYA_OTP,
    };

    return this.createBroker(BrokerType.SHOONYA, credentials);
  }
}
