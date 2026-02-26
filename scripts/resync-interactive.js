#!/usr/bin/env node

/**
 * Interactive Resync Script
 * 
 * Usage: node scripts/resync-interactive.js
 * 
 * This script provides a simple interactive way to resync scrip data
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║      🔄 Scrip Master Data Resync Tool              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('This tool will sync ~90,000 instrument records from Kotak API.\n');

  // Check if credentials are already set
  const hasToken = !!process.env.KOTAK_TRADING_TOKEN;
  const hasSid = !!process.env.KOTAK_TRADING_SID;

  if (hasToken && hasSid) {
    console.log('✅ Found credentials in environment variables\n');
    const proceed = await question('Proceed with sync? (yes/no): ');
    
    if (proceed.toLowerCase() !== 'yes' && proceed.toLowerCase() !== 'y') {
      console.log('\n❌ Cancelled\n');
      rl.close();
      process.exit(0);
    }
  } else {
    console.log('❌ Credentials not found in environment\n');
    
    const choice = await question('Do you have credentials ready? (yes/no): ');
    
    if (choice.toLowerCase() === 'yes' || choice.toLowerCase() === 'y') {
      console.log('\n📋 Getting credentials from browser:\n');
      console.log('1. Open: http://localhost:3000 (the app)');
      console.log('2. Make sure you are logged in');
      console.log('3. Open DevTools: Press F12');
      console.log('4. Go to Console tab');
      console.log('5. Run this command:');
      console.log('   JSON.stringify(JSON.parse(localStorage.getItem("kotak_session")), null, 2)');
      console.log('6. Copy the output\n');
      
      const token = await question('Enter your trading token (or paste from output): ');
      const sid = await question('Enter your trading SID: ');
      
      if (!token || !sid) {
        console.log('\n❌ Invalid credentials\n');
        rl.close();
        process.exit(1);
      }
      
      // Set environment variables
      process.env.KOTAK_TRADING_TOKEN = token;
      process.env.KOTAK_TRADING_SID = sid;
      
      console.log('\n✅ Credentials set\n');
    } else {
      console.log('\n📖 Please read RESYNC_GUIDE.md for detailed instructions\n');
      rl.close();
      process.exit(0);
    }
  }

  // Perform the sync
  rl.close();
  
  console.log('═'.repeat(50));
  console.log('\n📤 Starting sync...\n');
  
  try {
    const response = await fetch('http://localhost:3000/api/kotak/scrip/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumerKey: 'c63d7961-e935-4bce-8183-c63d9d2342f0',
        tradingToken: process.env.KOTAK_TRADING_TOKEN,
        tradingSid: process.env.KOTAK_TRADING_SID,
        fullSync: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Sync failed!\n');
      console.error(`Error: ${data.error}`);
      if (data.details) {
        console.error(`\nDetails: ${data.details}\n`);
      }
      process.exit(1);
    }

    console.log('═'.repeat(50));
    console.log('\n✅ Sync Completed!\n');
    console.log('📊 Summary:');
    console.log(`   Total Records: ${data.totalRecords.toLocaleString()}\n`);
    
    if (data.breakdown) {
      console.log('   By Segment:');
      Object.entries(data.breakdown).forEach(([segment, count]) => {
        if (count > 0) {
          console.log(`      ${segment.padEnd(12)}: ${count.toLocaleString()}`);
        }
      });
    }

    console.log('\n' + '═'.repeat(50));
    console.log('\n🎉 Done! Try searching for stocks now:\n');
    console.log('   • nifty     → NIFTY options');
    console.log('   • bank      → BANKNIFTY');
    console.log('   • infy      → INFY stocks');
    console.log('   • sensex    → SENSEX indices\n');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.log('\n⚠️  Make sure:');
    console.log('1. App is running: npm run dev');
    console.log('2. You are logged in to the app');
    console.log('3. Your session is still valid\n');
    process.exit(1);
  }
}

main();
