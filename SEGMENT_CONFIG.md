# 🔧 Segment Configuration Guide

## Current Setup

Currently syncing: **NSE FO only** (91,209 instruments)

---

## How to Add More Segments Later

### Step 1: Open the sync endpoint
File: `src/app/api/kotak/scrip/sync/route.ts`

### Step 2: Find the segments array (around line 354)
```typescript
// Currently on line ~354
const segments = ['nse_fo']; // CHANGE THIS TO ADD MORE SEGMENTS
```

### Step 3: Add more segments
```typescript
// Example 1: Add NSE stocks
const segments = ['nse_fo', 'nse_cm'];

// Example 2: Add all equity markets
const segments = ['nse_fo', 'nse_cm', 'bse_fo', 'bse_cm'];

// Example 3: Add everything (recommended when ready)
const segments = ['nse_fo', 'nse_cm', 'bse_fo', 'bse_cm', 'cde_fo'];
```

### Step 4: Click "Resync Scrip Data" button in the app

---

## Available Segments

| Code | Market | Type | Records | Status |
|------|--------|------|---------|--------|
| `nse_fo` | NSE | Futures & Options | 91,209 | ✅ ENABLED |
| `nse_cm` | NSE | Cash Market (Stocks) | 11,616 | ⏳ Optional |
| `bse_fo` | BSE | Futures & Options | 46,707 | ⏳ Optional |
| `bse_cm` | BSE | Cash Market (Stocks) | ? | ⏳ Optional |
| `cde_fo` | CDE | Currency Derivatives | 11,494 | ⏳ Optional |

---

## Adding Segments - Examples

### Add NSE Stocks (for equity trading)
```typescript
const segments = ['nse_fo', 'nse_cm'];
```
**Total**: ~102,825 instruments (NSE only)

### Add BSE Derivatives (for index options)
```typescript
const segments = ['nse_fo', 'bse_fo'];
```
**Total**: ~137,916 instruments (both derivatives)

### Add Currency Trading
```typescript
const segments = ['nse_fo', 'cde_fo'];
```
**Total**: ~102,703 instruments (derivatives + forex)

### Add Everything
```typescript
const segments = ['nse_fo', 'nse_cm', 'bse_fo', 'bse_cm', 'cde_fo'];
```
**Total**: ~194,620 instruments (full market)

---

## Implementation Notes

### The Code
```typescript
// Line ~354 in src/app/api/kotak/scrip/sync/route.ts

const segments = ['nse_fo']; // ← Just add more here!

for (const csvUrl of filesPaths) {
  const segmentMatch = csvUrl.match(/(nse_cm|bse_cm|nse_fo|bse_fo|cde_fo)/);
  const segment = segmentMatch ? segmentMatch[0] : 'unknown';

  if (segments.includes(segment)) {
    // This will sync all segments in the array above
    const count = await syncSegmentData(csvUrl, segment);
    results[segment] = count;
  }
}
```

### How It Works
1. **Fetches** all available segments from Kotak API
2. **Filters** to only sync segments in the `segments` array
3. **Downloads** CSV for each enabled segment
4. **Parses** and **deduplicates** records
5. **Upserts** to database in batches

---

## Sync Times

| Segments | Records | Time |
|----------|---------|------|
| NSE FO only | 91,209 | ~2-3 min ⚡ |
| NSE FO + CM | 102,825 | ~3-4 min ⚡ |
| All segments | 194,620 | ~5-7 min 🔄 |

---

## Testing After Adding Segments

### After adding `nse_cm` (stocks):
```
Search "INFY" → Find INFY stock + INFY options
Search "TCS" → Find TCS stock
```

### After adding `bse_fo` (BSE derivatives):
```
Search "SENSEX" → Find SENSEX options
Search "BANKEX" → Find BANKEX contracts
```

### After adding `cde_fo` (currency):
```
Search "USDINR" → Find US Dollar vs Rupee contracts
Search "EURINR" → Find EUR vs INR contracts
```

---

## When to Add More Segments

### ✅ Add NSE CM when you want:
- Stock trading (buy/sell shares)
- Access to individual company stocks

### ✅ Add BSE FO when you want:
- Index derivatives (SENSEX, BANKEX)
- Alternative to NSE options

### ✅ Add CDE FO when you want:
- Currency trading (USD, EUR, GBP pairs)
- Forex hedging

### ✅ Add everything when:
- You're ready to support all markets
- You have multiple trading strategies

---

## Future Roadmap

```
Phase 1 (Current): NSE FO ✅
├─ Options trading
├─ Futures trading
└─ Highly liquid, most popular

Phase 2: Add NSE Stocks
├─ Stock trading
├─ Fundamental analysis
└─ Dividend-paying stocks

Phase 3: Add Currency Market
├─ Forex derivatives
├─ Hedging strategies
└─ International trading

Phase 4: Add BSE Markets
├─ Regional preference
├─ Specific index derivatives
└─ Alternative liquidity
```

---

## Quick Reference

**To enable NSE + Stocks:**
```typescript
const segments = ['nse_fo', 'nse_cm'];
```

**To enable All:**
```typescript
const segments = ['nse_fo', 'nse_cm', 'bse_fo', 'bse_cm', 'cde_fo'];
```

**Location:** `src/app/api/kotak/scrip/sync/route.ts` line ~354

**Then:** Click "Resync Scrip Data" button in Trading tab

---

**It's that simple!** Just add more segment codes to the array. 🚀
