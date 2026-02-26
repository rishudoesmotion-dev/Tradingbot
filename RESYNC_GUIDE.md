# Scrip Master Resync Guide

This guide explains how to resync the scrip (instrument) master data from Kotak API.

## 🚀 Quick Start

### Option 1: Using the App UI (Easiest)

1. Open the app in browser
2. Login to Kotak Neo
3. Go to **Trading** tab
4. Click the **⭐ Sync Now** button (top right)
5. Wait for sync to complete
6. Search for stocks - they'll now show readable names

### Option 2: Using the CLI Script

```bash
# First, get your session credentials from browser console:
# 1. Open DevTools (F12)
# 2. Go to Console
# 3. Run: console.log(JSON.stringify(JSON.parse(localStorage.getItem("kotak_session")), null, 2))

# Set environment variables (Windows PowerShell):
$env:KOTAK_TRADING_TOKEN = "your_token_here"
$env:KOTAK_TRADING_SID = "your_sid_here"

# Then run the sync:
node scripts/resync.js
```

### Option 3: Using TypeScript Script

```bash
# Set environment variables first (see Option 2)

# Then run:
npx ts-node scripts/resync-scrips.ts
```

---

## 📝 Detailed Steps

### Step 1: Get Session Credentials

After logging in to the app, extract credentials from browser:

1. Open Developer Tools: **F12**
2. Go to **Console** tab
3. Copy and run this command:
   ```javascript
   console.log(JSON.stringify(JSON.parse(localStorage.getItem("kotak_session")), null, 2))
   ```
4. You'll see output like:
   ```json
   {
     "tradingToken": "eyJ0eXAiOiJKV1QiLCJhbGc...",
     "tradingSid": "fd5a3b8c-1234-5678-abcd-...",
     "baseUrl": "https://api.kotaksecurities.com",
     "consumerKey": "c63d7961-e935-4bce-8183-..."
   }
   ```

### Step 2: Set Environment Variables

**Windows (PowerShell):**
```powershell
$env:KOTAK_TRADING_TOKEN = "paste_your_token"
$env:KOTAK_TRADING_SID = "paste_your_sid"
$env:KOTAK_BASE_URL = "https://api.kotaksecurities.com"  # optional
```

**Linux/Mac (Bash):**
```bash
export KOTAK_TRADING_TOKEN="paste_your_token"
export KOTAK_TRADING_SID="paste_your_sid"
export KOTAK_BASE_URL="https://api.kotaksecurities.com"  # optional
```

### Step 3: Run the Sync

```bash
# Make sure app server is running
npm run dev

# In another terminal, run the sync script
node scripts/resync.js
```

---

## 📊 What Gets Synced?

The script syncs data from these Kotak segments:

| Segment | Description | Records |
|---------|-------------|---------|
| `nse_cm` | NSE Cash Market (Stocks) | ~5,000 |
| `nse_fo` | NSE Futures & Options | ~50,000 |
| `bse_cm` | BSE Cash Market | ~5,000 |
| `bse_fo` | BSE Futures & Options | ~20,000 |
| `cde_fo` | Currency Derivatives | ~100 |
| `mcx_fo` | Commodity Futures | ~10,000 |

**Total: ~90,000+ instruments**

---

## ✅ What You'll See After Sync

### Before (Codes):
```
68454
nse_fo | Lot: 30
```

### After (Readable Names):
```
NIFTY 25JAN25 100 PE
nse_fo | Lot: 30
```

---

## 🔍 Testing the Sync

After syncing, search for:

- **nifty** → Shows NIFTY futures & options
- **bank** → Shows BANKNIFTY contracts  
- **infy** → Shows INFY stocks
- **sensex** → Shows SENSEX indices

---

## ⚠️ Troubleshooting

### "No session found"
- Make sure you've logged in to the app first
- Session expires after logout or browser restart
- Log in again and re-run the script

### "Sync failed" or "Network error"
- Check if app server is running: `npm run dev`
- Check your internet connection
- Try again in a few minutes

### "Invalid token/SID"
- Session might have expired
- Log in again and get fresh credentials from browser

### Still shows codes instead of names
- The sync might still be in progress
- Refresh the browser page
- Try searching after 1-2 minutes

---

## 🔄 Rate Limiting

The app limits syncs to **once per 24 hours** to avoid overloading the API.

If you need to force a full resync:
1. Click the ⭐ button in Trading tab
2. Or clear localStorage: `localStorage.removeItem('kotak_scrip_last_sync_time')`
3. Then run the sync again

---

## 📞 Support

If sync fails:
1. Check the browser console for detailed error messages
2. Verify your Kotak account still has API access
3. Check that your credentials are still valid

---

**Last Updated:** February 26, 2026
