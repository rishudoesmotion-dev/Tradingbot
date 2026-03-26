// Update allowed instruments to only NIFTY (not BANKNIFTY)
require('dotenv').config({ path: '.env' });
const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

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

async function updateAllowedInstruments() {
  try {
    console.log('🔄 Updating allowed instruments to NIFTY only...\n');

    // 1. Get the config ID first
    const getConfigRes = await makeRequest('GET', '/rest/v1/trading_rules_config?select=id,allowed_instruments');
    
    if (getConfigRes.status !== 200) {
      throw new Error(`Failed to get config: ${getConfigRes.status}`);
    }

    const configs = JSON.parse(getConfigRes.data);
    if (!configs || configs.length === 0) {
      throw new Error('No configuration found');
    }

    const configId = configs[0].id;
    console.log(`📋 Found config with ID: ${configId}`);
    console.log(`   Current instruments: ${JSON.stringify(configs[0].allowed_instruments)}\n`);

    // 2. Update config to only allow NIFTY
    const configData = JSON.stringify({
      allowed_instruments: ['NIFTY']
    });

    const updatePath = `/rest/v1/trading_rules_config?id=eq.${configId}`;
    const configRes = await makeRequest('PATCH', updatePath, configData);
    
    if (configRes.status === 204 || configRes.status === 200) {
      console.log('✅ Config updated: allowed_instruments = ["NIFTY"]');
    } else {
      throw new Error(`Failed to update config: ${configRes.status} ${configRes.data}`);
    }

    // 3. Disable BANKNIFTY instruments
    const disableData = JSON.stringify({
      is_enabled: false
    });

    const disableRes = await makeRequest(
      'PATCH',
      '/rest/v1/allowed_instruments?symbol=in.("BANKNIFTY","BANKNIFTY-CE","BANKNIFTY-PE")',
      disableData
    );

    if (disableRes.status === 204 || disableRes.status === 200) {
      console.log('✅ BANKNIFTY instruments disabled (is_enabled = false)');
    } else {
      console.warn(`⚠️  Disable returned: ${disableRes.status}`);
    }

    // 4. Verify the changes
    console.log('\n📊 Verifying changes...');
    
    const verifyRes = await makeRequest('GET', '/rest/v1/trading_rules_config?select=*');
    
    if (verifyRes.status === 200) {
      const updatedConfig = JSON.parse(verifyRes.data)[0];
      console.log('✅ Config verified:');
      console.log(`   Allowed Instruments: ${JSON.stringify(updatedConfig.allowed_instruments)}`);
    }

    // 5. Check enabled instruments
    const enabledRes = await makeRequest('GET', '/rest/v1/allowed_instruments?is_enabled=eq.true&select=symbol');
    
    if (enabledRes.status === 200) {
      const enabledInstruments = JSON.parse(enabledRes.data);
      console.log(`\n📋 Enabled instruments (${enabledInstruments.length}):`);
      enabledInstruments.forEach(inst => {
        console.log(`   • ${inst.symbol}`);
      });
    }

    console.log('\n✨ Done! Only NIFTY is now allowed for trading\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateAllowedInstruments();
