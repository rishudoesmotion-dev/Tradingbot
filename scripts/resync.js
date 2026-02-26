#!/usr/bin/env node

/**
 * CLI Script to Resync Scrip Master Data
 * 
 * This is a standalone script that can be run from CLI
 * Usage: node scripts/resync.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_ENDPOINT = `${BASE_URL}/api/kotak/scrip/sync`;

async function getSessionFromBrowser() {
  console.log('\n📱 To get session data:');
  console.log('1. Open your browser DevTools (F12)');
  console.log('2. Go to Console tab');
  console.log('3. Run: console.log(JSON.stringify(JSON.parse(localStorage.getItem("kotak_session")), null, 2))');
  console.log('4. Copy the JSON output\n');
  
  return null;
}

async function resyncScrips() {
  try {
    console.log('\n🔄 Scrip Master Resync Tool\n');
    console.log('═'.repeat(50));

    // Check for session in environment
    let session = null;

    // Try multiple sources
    if (process.env.KOTAK_TRADING_TOKEN && process.env.KOTAK_TRADING_SID) {
      session = {
        tradingToken: process.env.KOTAK_TRADING_TOKEN,
        tradingSid: process.env.KOTAK_TRADING_SID,
        baseUrl: process.env.KOTAK_BASE_URL || null,
        consumerKey: process.env.KOTAK_CONSUMER_KEY || 'c63d7961-e935-4bce-8183-c63d9d2342f0',
      };
      console.log('✅ Loaded session from environment variables\n');
    }

    if (!session) {
      console.error('❌ No session credentials found!\n');
      await getSessionFromBrowser();
      
      console.log('📋 Then set environment variables:\n');
      console.log('Windows (PowerShell):');
      console.log('$env:KOTAK_TRADING_TOKEN = "your_token_here"');
      console.log('$env:KOTAK_TRADING_SID = "your_sid_here"\n');
      
      console.log('Linux/Mac (bash):');
      console.log('export KOTAK_TRADING_TOKEN="your_token_here"');
      console.log('export KOTAK_TRADING_SID="your_sid_here"\n');
      
      process.exit(1);
    }

    console.log('📊 Session Details:');
    console.log(`   Token: ${session.tradingToken.substring(0, 15)}...`);
    console.log(`   SID: ${session.tradingSid.substring(0, 15)}...`);
    console.log(`   Base URL: ${session.baseUrl || 'Dynamic'}\n`);

    console.log('═'.repeat(50));
    console.log('\n📤 Sending sync request...\n');

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumerKey: session.consumerKey,
        tradingToken: session.tradingToken,
        tradingSid: session.tradingSid,
        baseUrl: session.baseUrl,
        fullSync: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Sync failed!\n');
      console.error(`Status: ${response.status}`);
      console.error(`Error: ${data.error}`);
      if (data.details) {
        console.error(`Details: ${data.details}`);
      }
      console.log('');
      process.exit(1);
    }

    console.log('═'.repeat(50));
    console.log('\n✅ Sync Completed Successfully!\n');
    console.log('📈 Statistics:');
    console.log(`   Total Records: ${data.totalRecords.toLocaleString()}\n`);
    
    if (data.breakdown) {
      console.log('   Segment Breakdown:');
      Object.entries(data.breakdown).forEach(([segment, count]) => {
        if (count > 0) {
          console.log(`      • ${segment.padEnd(10)}: ${count.toLocaleString()}`);
        }
      });
    }

    console.log('\n' + '═'.repeat(50));
    console.log('\n🎉 Data sync complete!');
    console.log('📊 You can now search for stocks with readable names like:');
    console.log('   • NIFTY 25JAN25 100 PE');
    console.log('   • BANKNIFTY 26FEB25 46000 CE');
    console.log('   • SENSEX 25FEB25 CALL\n');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log('\n⚠️  Troubleshooting:');
    console.log('1. Make sure the app is running: npm run dev');
    console.log('2. Make sure you are logged in to the app');
    console.log('3. Check that credentials are correct\n');
    process.exit(1);
  }
}

// Run the sync
resyncScrips();
