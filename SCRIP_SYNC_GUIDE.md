# Scrip Master Sync Guide

## The Problem
The sync is failing with: `fetch failed` → `ENOTFOUND api.kotaksecurities.com`

This means your server can't reach Kotak's API. This could be due to:
- No internet connection
- Firewall/network blocking
- Kotak API being down

## Two Solutions Available

### ✅ Option 1: Quick Setup (For Testing & Development)
Use sample stock data to test the search functionality immediately.

**Steps:**
1. Go to **Dashboard** tab
2. Click **"Quick Setup"** button on "Scrip Master Data" section
3. Wait for "✅ Test data loaded!" message
4. Now you can search for: **INFY, TCS, RELIANCE, HDFC, ICICIBANK, LT, WIPRO, ASIANPAINT, MARUTI, BAJAJFINSV**
5. Go to **Trading** tab → Click **Connect** → Search box will appear and work!

**Sample stocks loaded:**
- INFY (Infosys)
- TCS (Tata Consultancy Services)
- RELIANCE (Reliance Industries)
- HDFC (HDFC Bank)
- ICICIBANK (ICICI Bank)
- And more...

---

### 📡 Option 2: Full Sync from Kotak API (Production)
Sync ALL ~500k instruments from Kotak's master data.

**Requirements:**
- ✅ Internet connection
- ✅ api.kotaksecurities.com accessible (no firewall blocking)
- ✅ Valid consumer key (already configured)

**Steps:**
1. Go to **Dashboard** tab
2. Click **"Sync Now"** button
3. Wait for "✅ Synced - X,XXX instruments" message
4. Now search works for ANY stock from all segments (NSE, BSE, F&O, etc.)

---

## Troubleshooting

### If "Sync Now" fails with network error:
**Try these:**
1. ✅ Check internet connection
2. ✅ Disable VPN/Firewall temporarily
3. ✅ Use **Quick Setup** instead for immediate testing

### If "Quick Setup" fails:
- Check Supabase connection in your `.env.local`
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and keys are correct
- Check server logs for details

---

## Recommended Flow for Development

1. **Use Quick Setup first** to test scrip search UI works ✅
2. **Get internet/network working**
3. **Run full Sync** to load all production data
4. Done! ✅

---

## What Gets Synced

### Quick Setup:
- 10 popular NSE stocks
- Instant (< 1 second)
- Good for testing UI/UX

### Full Sync:
- ~500,000+ instruments across all segments
- All NSE, BSE, F&O contracts
- Takes 2-5 minutes first time
- Then instant searches forever

---

## Need Help?

Check the console (F12 → Console tab) for error details and messages prefixed with `[SYNC]` or `[SETUP]`.
