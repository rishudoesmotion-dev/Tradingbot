#!/usr/bin/env node

/**
 * Initialize Supabase schema for Scrip Master
 * 
 * This script creates the necessary tables for scrip search functionality.
 * 
 * Usage:
 *   npx tsx scripts/init-scrip-schema.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.log('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function initSchema() {
  try {
    console.log('🔄 Initializing Supabase schema...');

    // Read the schema SQL
    const schemaPath = path.join(process.cwd(), 'supabase', 'scrip_master_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    // Execute the schema
    console.log('📝 Running SQL schema...');
    const { error } = await supabase.rpc('run_migration', {
      sql: schemaSql,
    });

    if (error) {
      // Try alternative approach using REST API
      console.log('⚠️  Direct RPC failed, trying SQL editor approach...');
      console.log('📋 Please run this SQL manually in Supabase:');
      console.log('---');
      console.log(schemaSql);
      console.log('---');
      console.log('\n📌 Steps:');
      console.log('1. Go to https://app.supabase.com/project/' + supabaseUrl.split('//')[1].split('.')[0]);
      console.log('2. Click "SQL Editor" -> "New query"');
      console.log('3. Paste the SQL above');
      console.log('4. Click "Run"');
      return;
    }

    console.log('✅ Schema initialized successfully!');
    console.log('📦 Tables created:');
    console.log('  - scrip_master');
    console.log('  - scrip_sync_log');
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('\n📋 Manual setup: Copy and paste this SQL in Supabase SQL Editor:');
    
    const schemaPath = path.join(process.cwd(), 'supabase', 'scrip_master_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    console.log(schemaSql);
    
    process.exit(1);
  }
}

initSchema();
