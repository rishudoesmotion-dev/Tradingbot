# Scrip Search Setup - Complete Guide

## Current Status
- ✅ Frontend (Scrip search component) - Ready
- ✅ API endpoints (sync & setup) - Ready  
- ❌ Supabase tables - **NEED TO CREATE**
- ❌ Sample data - Will load once tables exist

## The Issue You're Seeing

```
Quick Setup
❌ Error: scrip_master table not found
```

**Reason:** The Supabase tables haven't been created yet.

## Solution: 3 Simple Steps

### Step 1: Create Tables in Supabase (2 min)

1. Go to **https://app.supabase.com**
2. Select project **pssjbkaqafnotnmrmbxv**
3. Click **SQL Editor** → **New query**
4. Paste this SQL:

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

CREATE TABLE IF NOT EXISTS public.scrip_sync_log (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL,
  total_records INTEGER,
  segments TEXT,
  status TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrip_master_psymbol ON scrip_master(pSymbol);
CREATE INDEX IF NOT EXISTS idx_scrip_master_segment ON scrip_master(segment);
CREATE INDEX IF NOT EXISTS idx_scrip_master_ptrd_symbol ON scrip_master(pTrdSymbol);

ALTER TABLE scrip_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrip_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access to scrip_master for all users" ON scrip_master
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for scrip data" ON scrip_master
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable delete for scrip data" ON scrip_master
  FOR DELETE USING (true);

CREATE POLICY "Enable read access to scrip_sync_log for all users" ON scrip_sync_log
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for sync log" ON scrip_sync_log
  FOR INSERT WITH CHECK (true);
```

5. Click **Run** ✅

### Step 2: Load Sample Data (1 min)

1. **Refresh** your browser
2. Go to **Dashboard** tab
3. Find **"Scrip Master Data"** card
4. Click **"Quick Setup"** button (purple)
5. Wait for **"✅ Test data loaded!"** message

### Step 3: Search Stocks! (instant)

1. Go to **Trading** tab
2. Click **Connect** button
3. Scroll down
4. Type in search box: **INFY**, **TCS**, **RELIANCE**, etc.
5. Results appear! 🎉

## What You Get

**After Quick Setup:**
- 10 popular stocks available
- Instant search
- Test all trading features

**After Full Sync (when internet works):**
- 500,000+ stocks from NSE, BSE, F&O
- All segments covered
- Still instant search

## File Reference

- **Setup Guide:** `SUPABASE_SETUP_GUIDE.md`
- **Sync Guide:** `SCRIP_SYNC_GUIDE.md`  
- **Schema:** `supabase/scrip_master_schema.sql`

---

## Quick Checklist

- [ ] Create Supabase tables (SQL above)
- [ ] Click "Quick Setup" button
- [ ] See "✅ Test data loaded!" message
- [ ] Go to Trading tab
- [ ] Click Connect
- [ ] Search for INFY
- [ ] See results!
- [ ] ✅ Done!

---

## Still Having Issues?

**Error: "scrip_master table not found"**
→ Tables not created. Run the SQL above in Supabase.

**Error: "Failed to seed data"**
→ Check RLS policies. Make sure INSERT is enabled for authenticated users.

**Error: "Supabase not configured"**
→ Check .env file has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

**Search box doesn't appear**
→ Make sure you're connected to Kotak Neo (click Connect button first)

---

That's it! You should now have a fully functional scrip search! 🚀
