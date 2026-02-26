/**
 * Resync Scrips Script
 * 
 * This script manually triggers the scrip master sync from Kotak API
 * Usage: npx ts-node scripts/resync-scrips.ts
 * 
 * Requirements:
 * - Must be logged in to Kotak first
 * - Session stored in localStorage (kotak_session)
 */

import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3000/api/kotak/scrip/sync';

async function resyncScrips() {
  try {
    console.log('🔄 Starting Scrip Master Resync...\n');

    // Try to load session from a backup file or environment
    let session = null;

    // Check if session file exists
    const sessionFile = path.join(process.cwd(), '.scrip-session.json');
    if (fs.existsSync(sessionFile)) {
      const sessionData = fs.readFileSync(sessionFile, 'utf-8');
      session = JSON.parse(sessionData);
      console.log('✅ Loaded session from file');
    }

    // Fallback: try to get from environment variables
    if (!session && process.env.KOTAK_SESSION) {
      session = JSON.parse(process.env.KOTAK_SESSION);
      console.log('✅ Loaded session from environment');
    }

    if (!session) {
      console.error('❌ No session found!');
      console.log('\n📋 How to fix:');
      console.log('1. Login to the app first (http://localhost:3000)');
      console.log('2. Complete the authentication');
      console.log('3. Then run this script again\n');
      console.log('Alternatively, set KOTAK_SESSION environment variable:\n');
      console.log('$env:KOTAK_SESSION = \'{"tradingToken":"...", "tradingSid":"...", "baseUrl":"..."}\'\n');
      process.exit(1);
    }

    const { tradingToken, tradingSid, baseUrl, consumerKey } = session;

    if (!tradingToken || !tradingSid) {
      console.error('❌ Invalid session - missing tradingToken or tradingSid');
      process.exit(1);
    }

    console.log('📊 Session Details:');
    console.log(`   Trading Token: ${tradingToken.substring(0, 20)}...`);
    console.log(`   Trading SID: ${tradingSid.substring(0, 20)}...`);
    console.log(`   Base URL: ${baseUrl || 'Will be fetched dynamically'}`);
    console.log('');

    // Make sync request
    console.log('📤 Sending sync request to API...');
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumerKey: consumerKey || 'c63d7961-e935-4bce-8183-c63d9d2342f0',
        tradingToken,
        tradingSid,
        baseUrl,
        fullSync: true,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Sync failed!\n');
      console.error('Error:', result.error);
      if (result.details) {
        console.error('Details:', result.details);
      }
      process.exit(1);
    }

    console.log('\n✅ Sync Successful!\n');
    console.log('📈 Results:');
    console.log(`   Total Records: ${result.totalRecords.toLocaleString()}`);
    console.log(`   Segments Synced:`);

    if (result.breakdown) {
      Object.entries(result.breakdown).forEach(([segment, count]: [string, any]) => {
        console.log(`      • ${segment}: ${count.toLocaleString()}`);
      });
    }

    console.log('\n🎉 Done! You can now search for stocks with readable names.\n');
  } catch (error) {
    console.error('❌ Error during resync:', error);
    console.log('\n⚠️  Make sure:');
    console.log('1. The app server is running (npm run dev)');
    console.log('2. You are logged in to the app');
    console.log('3. The session is still valid\n');
    process.exit(1);
  }
}

// Main execution
resyncScrips();
