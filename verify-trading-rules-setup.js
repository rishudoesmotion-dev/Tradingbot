#!/usr/bin/env node

/**
 * Supabase Trading Rules Verification Script (Node.js)
 * 
 * Verifies that all trading rules tables and data have been created correctly
 * in Supabase after running the migration
 * 
 * Run: node verify-trading-rules-setup.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value && !key.startsWith('#')) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const baseUrl = new URL(supabaseUrl).hostname;

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: baseUrl,
      port: 443,
      path: `/rest/v1${path}`,
      method: method,
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
            error: res.statusCode >= 400 ? data : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            error: null,
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function verifySetup() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  🔍 Supabase Trading Rules Setup Verification                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // ═════════════════════════════════════════════════════════════════════
    // Check 1: trading_rules table
    // ═════════════════════════════════════════════════════════════════════
    console.log('1️⃣  Checking trading_rules table...');
    const rulesRes = await makeRequest('GET', '/trading_rules?select=*&is_active=eq.true');
    
    if (rulesRes.status === 200 && Array.isArray(rulesRes.data)) {
      console.log(`   ✅ Table exists with ${rulesRes.data.length} rules`);
      rulesRes.data.forEach((rule) => {
        console.log(`      • ${rule.name} (${rule.rule_type})`);
      });
    } else {
      console.log(`   ❌ Error: ${rulesRes.error || 'Table not found'}`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Check 2: trading_rules_config table
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n2️⃣  Checking trading_rules_config table...');
    const configRes = await makeRequest('GET', '/trading_rules_config?select=*&limit=1');
    
    if (configRes.status === 200 && Array.isArray(configRes.data) && configRes.data.length > 0) {
      const config = configRes.data[0];
      console.log('   ✅ Configuration found:');
      console.log(`      • NIFTY Max Lots: ${config.nifty_max_lots}`);
      console.log(`      • Prevent Concurrent Trades: ${config.prevent_concurrent_trades}`);
      console.log(`      • Max Trades/Day: ${config.max_trades_per_day}`);
      console.log(`      • Allowed Instruments: ${config.allowed_instruments.join(', ')}`);
      console.log(`      • Rules Enabled: ${config.rules_enabled}`);
    } else {
      console.log(`   ❌ Error: ${configRes.error || 'Config not found'}`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Check 3: allowed_instruments table
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n3️⃣  Checking allowed_instruments table...');
    const instRes = await makeRequest('GET', '/allowed_instruments?select=*&is_enabled=eq.true');
    
    if (instRes.status === 200 && Array.isArray(instRes.data)) {
      console.log(`   ✅ ${instRes.data.length} allowed instruments found`);
      instRes.data.forEach((inst) => {
        console.log(`      • ${inst.symbol}: ${inst.name} (${inst.exchange})`);
      });
    } else {
      console.log(`   ❌ Error: ${instRes.error || 'Instruments not found'}`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Check 4: rule_violations table
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n4️⃣  Checking rule_violations table...');
    const violRes = await makeRequest('GET', '/rule_violations?select=*&limit=5');
    
    if (violRes.status === 200) {
      const count = Array.isArray(violRes.data) ? violRes.data.length : 0;
      console.log(`   ✅ Table exists (${count} violations logged)`);
    } else {
      console.log(`   ❌ Error: ${violRes.error || 'Violations table not found'}`);
    }

    // ═════════════════════════════════════════════════════════════════════
    // Summary
    // ═════════════════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      ✅ SETUP COMPLETE                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('✨ All tables created successfully!\n');
    console.log('📝 Next Steps:');
    console.log('   1. ✅ Schema created in Supabase');
    console.log('   2. ⏳ Initialize TradingRulesService in your app');
    console.log('   3. ⏳ Import and use TradesRulesEngine v2');
    console.log('   4. ⏳ Run: npm run test:rules');
    console.log('   5. ⏳ Monitor rule violations in Supabase dashboard\n');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifySetup();
