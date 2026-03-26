## 🛠️ Supabase Database Setup Guide

This document explains how to set up all required tables in Supabase for the Trading Bot.

### Prerequisites
- Supabase account and project created
- Access to Supabase SQL Editor

### Tables Required

The following tables must be created in your Supabase database:

1. **scrip_master** - Instrument/Symbol Master Data
   - Synced daily from Kotak API
   - Contains all tradeable symbols with metadata

2. **positions** - Current Open Positions ⭐ (NEW)
   - Stores real-time position P&L
   - Automatically updated when positions change
   - Critical for risk management checks

3. **trading_config** - Trading Rules Configuration
   - Global settings: concurrent trades, lot limits, daily limits
   - Single row table with master switch

4. **trade_rules** - Individual Rule Definitions
   - Specific trading rules and restrictions
   - Log of rule violations

5. **trade_logs** - Historical Trade Data
   - Logged after order fills
   - Used for statistics and backtesting

### Setup Steps

#### Step 1: Run Scrip Master Schema
```sql
-- File: supabase/scrip_master_schema.sql
-- This creates the scrip_master table for instrument data
```

1. Go to: https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new
2. Copy the entire contents of `supabase/scrip_master_schema.sql`
3. Paste into the SQL editor
4. Click "Run"
5. Verify: You should see the `scrip_master` table in the "Tables" sidebar

#### Step 2: Run Positions Schema ⭐ IMPORTANT
```sql
-- File: supabase/positions_schema.sql
-- This creates the positions table for tracking open positions
```

1. Create a new SQL query: https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new
2. Copy the entire contents of `supabase/positions_schema.sql`
3. Paste into the SQL editor
4. Click "Run"
5. Verify: You should see the `positions` table in the "Tables" sidebar

#### Step 3: Run Trading Rules Setup Schema
```sql
-- File: supabase/SETUP_TRADING_RULES.sql
-- This creates tables for trading rules management
```

1. Create a new SQL query: https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new
2. Copy the entire contents of `supabase/SETUP_TRADING_RULES.sql`
3. Paste into the SQL editor
4. Click "Run"
5. Verify: You should see `trading_config`, `trade_rules`, and `rule_violations` tables

#### Step 4: Run Trades Schema
```sql
-- File: supabase/trades_schema.sql
-- This creates tables for trade history and logging
```

1. Create a new SQL query: https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new
2. Copy the entire contents of `supabase/trades_schema.sql`
3. Paste into the SQL editor
4. Click "Run"
5. Verify: You should see the `trades` table in the "Tables" sidebar

### Verify All Tables

After running all migrations, check that these tables exist:

- [ ] `scrip_master` - Instruments/symbols
- [ ] `positions` - **Current open positions (critical)**
- [ ] `trading_config` - Global trading rules
- [ ] `trade_rules` - Individual rules
- [ ] `rule_violations` - Rule violation logs
- [ ] `trades` - Trade history

In Supabase console:
1. Go to "Tables" sidebar
2. Expand to see all tables
3. Click on each table to verify it has the correct columns

### Common Issues

#### ❌ Error: "Could not find the table 'positions'"
**Solution**: Run `supabase/positions_schema.sql` in Supabase SQL editor

#### ❌ Error: "Permission denied" when inserting
**Solution**: The RLS policies may be too strict. Check the SQL file and ensure RLS allows public access (for development).

In Supabase console:
1. Go to each table
2. Click "RLS" tab
3. Verify policies allow your use case (public or authenticated)

#### ❌ Error: "Could not find the table 'trading_config'"
**Solution**: Run `supabase/SETUP_TRADING_RULES.sql` in Supabase SQL editor

### Initialization from Application

After creating all tables, you can initialize the default configuration:

1. **Trading Config** - The app will read from this table
   - Verify a row exists with default values
   - If not, insert manually or via API

2. **Allowed Instruments** - Configure which symbols can be traded
   - By default, only NIFTY CE/PE options are allowed
   - Edit `trading_config.allowed_instruments` to add/remove

### Development vs Production

#### Development (Current Setup)
- RLS policies allow public access (no authentication required)
- Suitable for local testing
- Less secure

#### Production Setup (Recommended)
- Enable user authentication
- Update RLS policies to use `auth.uid()`
- Use service role key for backend operations only

To enable authentication:
1. Enable Supabase Auth in your project
2. Update all `CREATE POLICY` statements to check `auth.uid()`
3. Pass authenticated user's JWT in API requests

### Next Steps

1. ✅ Create all tables (steps above)
2. ✅ Verify tables exist in Supabase console
3. 🔄 Run the app: `npm run dev`
4. 🔄 Sync instruments: Click "Sync" button in the Trading Panel
5. 🔄 Start trading!

### Support

If you encounter any issues:
1. Check the error message in browser console
2. Verify the table exists in Supabase console
3. Check RLS policies are correct
4. Ensure environment variables are set correctly in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
