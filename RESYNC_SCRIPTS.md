# ✅ Resync Scripts Created

I've created multiple ways to resync your scrip master data. Here's what's available:

---

## 🎯 Three Ways to Resync

### 1. **Easiest: UI Button (Recommended)**
- Open the app
- Go to **Trading** tab
- Click **⭐ Sync Now** button
- Watch the progress
- That's it!

### 2. **CLI Script** (For automation)
```bash
# Set credentials from browser localStorage
$env:KOTAK_TRADING_TOKEN = "your_token"
$env:KOTAK_TRADING_SID = "your_sid"

# Run sync
npm run resync
```

### 3. **TypeScript Script** (For Node.js power users)
```bash
npm run resync:ts
```

---

## 📁 New Files Created

### 1. `scripts/resync.js`
- Pure JavaScript (no dependencies)
- Works on Node.js directly
- Minimal, fast, reliable
- **Use this for CLI automation**

### 2. `scripts/resync-scrips.ts`
- TypeScript version
- Enhanced error handling
- Better logging
- **Use this if you need TypeScript features**

### 3. `RESYNC_GUIDE.md`
- Complete documentation
- Step-by-step instructions
- Troubleshooting tips
- Environment variable setup

---

## 🚀 Quick Start

### Step 1: Get Your Session

Open browser console and run:
```javascript
console.log(JSON.stringify(JSON.parse(localStorage.getItem("kotak_session")), null, 2))
```

Copy the `tradingToken` and `tradingSid` values.

### Step 2: Set Environment Variables

**Windows PowerShell:**
```powershell
$env:KOTAK_TRADING_TOKEN = "paste_token"
$env:KOTAK_TRADING_SID = "paste_sid"
```

**Linux/Mac:**
```bash
export KOTAK_TRADING_TOKEN="paste_token"
export KOTAK_TRADING_SID="paste_sid"
```

### Step 3: Run Sync

```bash
npm run resync
```

---

## ✨ What Happens During Sync

1. **Connects** to Kotak API using your credentials
2. **Fetches** instrument master data (~90k records)
3. **Parses** CSV files from 6 market segments
4. **Converts** camelCase → snake_case
5. **Uploads** to Supabase (using upsert for duplicates)
6. **Logs** sync progress and completion

**Time:** Usually 2-5 minutes for full sync

---

## 📊 After Sync

You'll be able to search and see readable instrument names:

| Search | Results |
|--------|---------|
| **nifty** | NIFTY 25JAN25 100 PE, NIFTY 25JAN25 100 CE |
| **bank** | BANKNIFTY 26FEB25 46000 PE, ... |
| **infy** | INFY (Stock), INFY Options |
| **sensex** | SENSEX 25FEB25 CALL, SENSEX 25FEB25 PUT |

---

## 🔄 npm Scripts

Added to `package.json`:

```json
"resync": "node scripts/resync.js",
"resync:ts": "ts-node scripts/resync-scrips.ts"
```

Run with:
```bash
npm run resync      # JavaScript version
npm run resync:ts   # TypeScript version
```

---

## ⚠️ Important Notes

- **Session expires** after logout - get fresh credentials before syncing
- **Rate limited** to once per 24 hours (configurable)
- **First sync** might take 3-5 minutes (large dataset)
- **All 90k+ records** synced automatically
- **No manual work** needed - just click Sync Now!

---

## 📚 Documentation

See `RESYNC_GUIDE.md` for:
- Detailed troubleshooting
- Environment variable setup
- Testing the sync
- Rate limiting info
- Support guide

---

**You can now resync anytime without restarting the app!** 🎉
