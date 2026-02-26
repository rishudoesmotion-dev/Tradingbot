# 🚀 Quick Start Guide

## 30-Second Setup

### 1. Update `.env` with Supabase Keys
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 2. Run the App
```bash
npm run dev
```

### 3. Open Browser
```
http://localhost:3000
```

---

## What You'll See

### **Page 1: Dashboard** (Default)
- Order stats (total trades, win rate, P&L)
- Recent orders from database
- All visible without login

### **Page 2: Trading** (After Login)
- Buy/Sell interface
- Position management
- Kill switch

---

## Login Flow

1. Click **"Login"** button (top right)
2. Modal opens → Enter **TOTP** from your authenticator app
3. Click **"Validate TOTP"**
4. Enter your **MPIN** (`654321` in .env)
5. Click **"Validate MPIN"**
6. ✅ **Success!** → Trading tab unlocks

**Note**: Consumer Key, Mobile, UCC auto-filled from `.env`

---

## Trading Operations

### Buy a Stock
1. Go to Trading tab
2. Enter symbol (e.g., "INFY")
3. Enter quantity (e.g., 5)
4. Click **"Buy"** → Market order placed
5. Order appears in dashboard

### Sell a Stock
1. Same as Buy, but click **"Sell"**

### Exit Position
1. Find position in positions list
2. Click **"Exit"** link next to it

### Emergency Kill Switch
1. Click **"Kill Switch - Exit All"** button
2. Closes all open positions immediately

---

## Database (Supabase)

Your trades are automatically stored in:

**Table: `trade_logs`**
```
symbol    | INFY
exchange  | NSE
side      | BUY
quantity  | 5
price     | 1850.50
pnl       | 450.00
timestamp | 2024-02-26T10:30:00Z
```

Dashboard automatically displays recent trades from this table.

---

## Environment Variables Explained

```env
# Kotak Credentials (Static - stored in .env)
KOTAK_CONSUMER_KEY=c63d7961-...     # Your API key
KOTAK_MOBILE_NUMBER=+916375922829   # Your registered number
KOTAK_UCC=V2Q1T                      # Your client code
KOTAK_MPIN=654321                    # Your PIN (only for MPIN validation)

# Supabase (For historical data)
NEXT_PUBLIC_SUPABASE_URL=...         # Your project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...    # Your anon key
```

**Note**: `NEXT_PUBLIC_*` variables are safe to expose in frontend code (they're public API keys, not secrets).

---

## Common Tasks

### Add Sample Data to Dashboard
1. Go to Supabase dashboard
2. Click **Table Editor** → `trade_logs`
3. Click **Insert row** → Add trade details
4. Refresh app → It appears on dashboard

### View Your Trade History
1. Go to Dashboard tab
2. Scroll to **Recent Orders** section
3. Shows last 10 trades from database

### Check Connection Status
1. Go to Trading tab (after login)
2. Top bar shows: ✅ Connected or ❌ Disconnected
3. Also shows current balance

---

## Troubleshooting

### ❌ Login Modal Won't Open
- Check if "Login" button is visible in header
- Try refreshing page

### ❌ TOTP/MPIN Validation Fails
- Make sure you're entering exactly 6 digits
- TOTP code expires in ~30 seconds (re-check authenticator app)
- MPIN should be `654321` (from .env)

### ❌ No Orders Show on Dashboard
- Check if you have data in Supabase `trade_logs` table
- Or place a trade and wait a moment for it to appear

### ❌ Supabase Error in Console
- Did you add `NEXT_PUBLIC_SUPABASE_URL` and key to `.env`?
- Did you restart the dev server after updating `.env`?

---

## File Locations

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main page (tabs + modal) |
| `src/components/Dashboard.tsx` | Stats & orders widget |
| `src/components/KotakNeoLogin.tsx` | Login modal |
| `src/components/QuickTrade_v2.tsx` | Buy/Sell interface |
| `supabase/schema.sql` | Database structure |
| `.env` | Configuration (credentials) |

---

## Next Steps

1. ✅ Update `.env` with Supabase keys
2. ✅ Run `npm run dev`
3. ✅ Test dashboard (should load without login)
4. ✅ Click Login and authenticate
5. ✅ Try placing an order
6. ✅ Check dashboard - order should appear

---

## Support Files

📖 **SETUP_COMPLETE.md** - Full architecture overview  
📖 **SUPABASE_SETUP.md** - How to get Supabase credentials  
📖 **FINAL_CHECKLIST.md** - Complete feature checklist  

---

**You're all set!** 🎉 The app is production-ready.
