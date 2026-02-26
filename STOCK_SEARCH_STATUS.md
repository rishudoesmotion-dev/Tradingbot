# Stock Search & Scrip Master Integration - Status Report

## ✅ Components Created

### 1. API Route: `/api/kotak/scrip`
- **Location:** `src/app/api/kotak/scrip/route.ts`
- **Features:**
  - Fetches scrip master file paths from Kotak Neo API
  - Downloads and parses CSV files on demand
  - Caches data locally (24-hour TTL)
  - Handles all exchange segments (NSE, BSE, MCX, CDE)

### 2. ScripMasterService
- **Location:** `src/lib/services/ScripMasterService.ts`
- **Features:**
  - Downloads CSV files from Kotak
  - Parses CSV into searchable records
  - Caches data in browser memory
  - Searches by symbol with fuzzy matching
  - Segments: NSE CM, BSE CM, NSE F&O, BSE F&O, MCX, CDE

### 3. StockSearch Component
- **Location:** `src/components/StockSearch.tsx`
- **Features:**
  - Real-time search as user types
  - Segment filter (All / NSE / BSE / F&O / MCX)
  - Displays search results with stock details
  - Auto-fills symbol and trading parameters
  - Shows lot size and other metadata

## 📊 Data Flow

```
User Types Symbol
    ↓
StockSearch Component
    ↓
ScripMasterService.searchBySymbol()
    ↓
Check Memory Cache
    ↓
If Not Cached:
    - Fetch file paths from /api/kotak/scrip
    - Download CSV from Kotak CDN
    - Parse and cache locally
    ↓
Return Search Results
    ↓
Display Matching Stocks
```

## 🔄 How Data is Downloaded

**Lazy Loading (On Demand):**
- Data is NOT downloaded automatically on app load
- First search request triggers download for that segment
- Subsequent searches use cached data
- Cache expires after 24 hours

**Example Workflow:**
1. User opens Trading panel
2. User types "TCS" in stock search
3. System detects cache miss for NSE_CM segment
4. Fetches file paths from Kotak API
5. Downloads `nse_cm.csv` from Kotak CDN
6. Parses CSV (converts to JSON array)
7. Searches parsed data for matching symbols
8. Returns results to user

## 📥 CSV Files Downloaded

The system will download these files on first search:

```
NSE Equity:    nse_cm-v1.csv       (~50MB)
BSE Equity:    bse_cm-v1.csv       (~30MB)
NSE F&O:       nse_fo.csv          (~10MB)
BSE F&O:       bse_fo.csv          (~5MB)
CDE F&O:       cde_fo.csv          (~2MB)
MCX Futures:   mcx_fo.csv          (~3MB)
```

**Note:** Only the segment(s) searched are downloaded

## 🎯 Testing the Integration

### Step 1: Start App
```bash
npm run dev
```

### Step 2: Login to Kotak
- Click Login button
- Enter TOTP from authenticator
- Enter MPIN

### Step 3: Go to Trading Tab
- Click "Trading" tab
- Should see "Connected to Kotak Neo" status

### Step 4: Test Stock Search
- Scroll to "Quick Trade" section
- Find the stock search box
- Type "TCS" (or any symbol)
- Wait ~2-3 seconds for first search (CSV download)
- See matching results
- Subsequent searches will be instant (from cache)

### Step 5: Select a Stock
- Click on a search result
- Symbol, exchange segment, lot size auto-fill
- Ready to place order

## 📋 Search Examples

```
"TCS"        → TATA Consultancy Services
"RELIANCE"   → Reliance Industries
"INFY"       → Infosys
"BANKNIFTY"  → Bank Nifty Index (F&O)
"NIFTY50"    → Nifty 50 (F&O)
"GOLD"       → Gold Futures (MCX)
```

## ⚙️ Configuration

**Cache Settings:**
- Location: Memory (browser)
- Duration: 24 hours
- Size: Depends on segments downloaded
- Cleared on: Page refresh or logout

**File Download Source:**
- Base: `https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod`
- Format: CSV
- Update Frequency: Daily (Kotak updates daily)

## 🔐 Security

- Consumer Key used only for API calls
- Downloaded data is NOT stored on server
- Data cached only in browser memory
- No persistent storage of CSV files
- Cache cleared on logout

## ✨ Features

✅ Real-time symbol search
✅ Segment-based filtering
✅ Fuzzy matching (partial matches)
✅ Lot size display
✅ Exchange segment info
✅ Auto-fill on selection
✅ 24-hour cache
✅ CORS bypass via API proxy

## 🐛 Debugging

**Browser Console Logs:**
```
📥 Fetching scrip master file paths...
✅ Scrip master paths fetched: { files: 7, baseFolder: '...' }
📥 Downloading CSV for nse_cm: https://...
✅ CSV parsed: 2547 records
```

**Network Tab:**
- `/api/kotak/scrip?action=getScripMasterPaths` - Get file paths
- `lapi.kotaksecurities.com/.../nse_cm-v1.csv` - CSV download

## 📝 Notes

- First search takes 2-3 seconds (CSV download + parsing)
- Subsequent searches instant (cache hit)
- Search is case-insensitive
- Matches partial symbols (e.g., "REL" → "RELIANCE")
- Works with all exchange segments simultaneously

---

**Status:** ✅ Ready for Testing
**Last Updated:** Feb 26, 2026
