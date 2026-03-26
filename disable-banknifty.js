// Disable BANKNIFTY using individual update calls
require('dotenv').config({ path: '.env' });
const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function makeRequest(method, path, data = null) {
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

    if (data) {
      options.headers['Content-Length'] = data.length;
      options.headers['Prefer'] = 'return=minimal';
    }

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: responseData }));
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function disableBanknifty() {
  try {
    console.log('🔄 Disabling BANKNIFTY instruments...\n');

    const instruments = [
      'BANKNIFTY',
      'BANKNIFTY-CE',
      'BANKNIFTY-PE'
    ];

    for (const symbol of instruments) {
      console.log(`  Disabling ${symbol}...`);
      
      const data = JSON.stringify({
        is_enabled: false
      });

      // Use symbol filter for update
      const path = `/rest/v1/allowed_instruments?symbol=eq.${symbol}`;
      const res = await makeRequest('PATCH', path, data);

      if (res.status === 204 || res.status === 200) {
        console.log(`    ✅ ${symbol} disabled`);
      } else {
        console.log(`    ⚠️  Status: ${res.status}`);
        console.log(`       Response: ${res.data.substring(0, 100)}`);
      }
    }

    // Verify
    console.log('\n📊 Verifying changes...');
    const verifyRes = await makeRequest('GET', '/rest/v1/allowed_instruments?select=symbol,is_enabled');
    
    if (verifyRes.status === 200) {
      const instruments = JSON.parse(verifyRes.data);
      
      console.log('\nAll Instruments Status:');
      instruments.forEach(inst => {
        const status = inst.is_enabled ? '✅ ENABLED' : '❌ DISABLED';
        console.log(`  ${inst.symbol.padEnd(15)} ${status}`);
      });
    }

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

disableBanknifty();
