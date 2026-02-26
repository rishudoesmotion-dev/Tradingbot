# Setup Supabase Tables for Scrip Search

The scrip search feature requires two tables in Supabase: `scrip_master` and `scrip_sync_log`.

## Quick Setup (2 minutes)

### Step 1: Copy the SQL Schema

```sql
-- Create scrip_master table
CREATE TABLE IF NOT EXISTS public.scrip_master (
  id BIGSERIAL PRIMARY KEY,
  pSymbol TEXT NOT NULL,
  pExchSeg TEXT NOT NULL,
  pTrdSymbol TEXT NOT NULL,
  lLotSize INTEGER NOT NULL DEFAULT 1,
  pInstrName TEXT,
  lExpiryDate BIGINT,
  segment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(pSymbol, pExchSeg)
);

-- Create scrip_sync_log table to track sync operations
CREATE TABLE IF NOT EXISTS public.scrip_sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL,
  total_records INTEGER,
  segments TEXT,
  status TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_scrip_master_psymbol ON scrip_master(pSymbol);
CREATE INDEX IF NOT EXISTS idx_scrip_master_segment ON scrip_master(segment);
CREATE INDEX IF NOT EXISTS idx_scrip_master_ptrd_symbol ON scrip_master(pTrdSymbol);

-- Enable RLS
ALTER TABLE scrip_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrip_sync_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access to scrip_master for all users" ON scrip_master
  FOR SELECT USING (true);

CREATE POLICY "Enable read access to scrip_sync_log for all users" ON scrip_sync_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert scrip data" ON scrip_master;
CREATE POLICY "Allow authenticated users to insert scrip data" ON scrip_master
  FOR INSERT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow authenticated users to delete scrip data" ON scrip_master;
CREATE POLICY "Allow authenticated users to delete scrip data" ON scrip_master
  FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
```

### Step 2: Run in Supabase

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project (pssjbkaqafnotnmrmbxv)

2. **Open SQL Editor**
   - Click "SQL Editor" in left menu
   - Click "+ New query"

3. **Paste the SQL**
   - Copy the SQL above
   - Paste into the editor
   - Click "Run" (or press Ctrl+Enter)

4. **Done! ✅**

### Step 3: Load Sample Data

1. **Go to Dashboard** of your trading app
2. **Click "Quick Setup"** button on "Scrip Master Data" card
3. **Wait** for "✅ Test data loaded!" message
4. **Go to Trading tab** and search for stocks!

## Troubleshooting

### If you see "scrip_master table not found"

**Solution:** Run the SQL schema above in Supabase SQL Editor

### If "Quick Setup" still fails

1. Check Supabase credentials in `.env` file:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://pssjbkaqafnotnmrmbxv.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

2. Verify tables exist:
   - Go to Supabase → Table Editor
   - You should see `scrip_master` and `scrip_sync_log` tables

3. Check table permissions:
   - Select `scrip_master` table
   - Go to "Auth" tab
   - Ensure SELECT and INSERT policies are enabled

## What Gets Created

| Table | Purpose | Records |
|-------|---------|---------|
| `scrip_master` | Stores stock/instrument data | 10 (after Quick Setup), or 500k+ (after Full Sync) |
| `scrip_sync_log` | Tracks sync history | Grows with each sync |

## Next Steps

After tables are created:

1. ✅ Quick Setup to load 10 sample stocks
2. ✅ Test scrip search in Trading tab
3. ⚙️ Full Sync when internet is available to load all stocks

**That's it! Scrip search will now work!** 🚀
