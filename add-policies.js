// Run SQL to add UPDATE policies to Supabase
require('dotenv').config({ path: '.env' });
const https = require('https');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: new URL(supabaseUrl).hostname,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: responseData }));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function addPolicies() {
  try {
    console.log('🔐 Adding UPDATE and INSERT policies to Supabase...\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'supabase', 'add-update-policies.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`[${i + 1}/${statements.length}] Executing policy...`);
      
      const res = await executeSQL(statement);
      
      if (res.status === 200) {
        console.log(`    ✅ Policy created`);
      } else if (res.status === 409) {
        console.log(`    ⚠️  Already exists (409 Conflict)`);
      } else {
        console.log(`    Status: ${res.status}`);
        if (res.data.length < 200) {
          console.log(`    ${res.data}`);
        }
      }
    }

    console.log('\n✨ Policies setup complete!');
    console.log('\nNow you can update allowed_instruments...');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addPolicies();
