// Check all instruments and their enabled status
require('dotenv').config({ path: '.env' });
const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: new URL(supabaseUrl).hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: responseData }));
    });

    req.on('error', reject);
    req.end();
  });
}

async function checkInstruments() {
  try {

    // Get all instruments with their enabled status
    const res = await makeRequest('GET', '/rest/v1/allowed_instruments?select=symbol,is_enabled');
    
    if (res.status === 200) {
      const instruments = JSON.parse(res.data);
      
      console.log('All Instruments:');
      instruments.forEach(inst => {
        const status = inst.is_enabled ? '✅ ENABLED' : '❌ DISABLED';
        console.log(`  ${inst.symbol.padEnd(15)} ${status}`);
      });

      const enabled = instruments.filter(i => i.is_enabled);
      const disabled = instruments.filter(i => !i.is_enabled);

      console.log(`\n📊 Summary:`);
      console.log(`  Enabled: ${enabled.length}`);
      enabled.forEach(i => console.log(`    • ${i.symbol}`));
      console.log(`  Disabled: ${disabled.length}`);
      disabled.forEach(i => console.log(`    • ${i.symbol}`));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkInstruments();
