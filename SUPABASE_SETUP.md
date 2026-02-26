# Setting Up Supabase Environment Variables

## Get Your Supabase Credentials

### 1. Go to Supabase Dashboard
- Visit: https://app.supabase.com
- Sign in to your account
- Select your project

### 2. Find Your Credentials
In the Supabase dashboard:

**Left Sidebar → Settings → API**

You'll see:

```
Project URL (copy this)
anon key (copy this)
service_role key (NOT needed for this app)
```

### 3. Add to Your `.env` File

Open `c:\Users\sachin.gautam\Documents\work\personal\Tradingbot\.env`

Add these lines:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example (Replace with your actual values):
```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdef123456.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZjEyMzQ1NiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjc4OTAxNjAwLCJleHAiOjE2Nzg5MDUyMDB9.xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Verify Your Tables Exist

### 1. Go to SQL Editor in Supabase
- Left Sidebar → SQL Editor
- Click "New Query"

### 2. Run the schema (from `supabase/schema.sql`)
The schema creates:
- `trade_logs` table
- `positions` table  
- `daily_stats` view (pre-aggregated data)

If you haven't run the schema yet, copy all the SQL from `supabase/schema.sql` and paste it into the query editor, then click "Run".

### 3. Check the Tables
- Left Sidebar → Table Editor
- You should see `trade_logs` and `positions` tables
- They might be empty (that's okay)

---

## Test the Connection

After updating `.env`:

1. **Restart your dev server**
   ```bash
   npm run dev
   ```

2. **Open the dashboard**
   - Go to http://localhost:3000
   - You should see the Dashboard tab
   - If tables are empty, it shows "No trades yet"
   - If you have data, it displays in the table

3. **Check browser console** (F12 → Console)
   - Should NOT see Supabase errors
   - If you see "Cannot find module 'supabase'" → run `npm install @supabase/supabase-js`

---

## Add Sample Data (Optional)

If you want to test with sample data:

### 1. Go to Supabase Table Editor
- Click `trade_logs` table
- Click "Insert" button
- Add a row:

```
symbol: INFY
exchange: NSE
side: BUY
quantity: 5
price: 1850
pnl: 450
timestamp: 2024-02-20T10:30:00Z
broker_name: KOTAK_NEO
```

### 2. Refresh your app
- Dashboard should now show this trade in the table

---

## Common Issues

### ❌ "Cannot find module '@supabase/supabase-js'"
**Fix:**
```bash
npm install @supabase/supabase-js
```

### ❌ "Invalid API key"
**Check:**
- Are you using the correct credentials from Supabase dashboard?
- Is the API key from "anon" section, not "service_role"?
- No extra spaces or copy/paste errors?

### ❌ "Table trade_logs does not exist"
**Fix:**
- Run the SQL schema from `supabase/schema.sql` in Supabase SQL Editor
- This creates the table structure

### ❌ Dashboard shows "Loading..." forever
**Check:**
- Browser console for errors (F12 → Console)
- Is your Supabase URL correct?
- Is the anon key correct?
- Are RLS policies configured? (Usually shouldn't matter for auth'd users)

---

## That's It!

Once set up:
- Dashboard auto-loads trade history from Supabase
- When you trade, orders get saved to `trade_logs` table
- Stats update in real-time

Questions? Check `SETUP_COMPLETE.md` for the full system overview.
