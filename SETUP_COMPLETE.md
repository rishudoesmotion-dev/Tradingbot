# 🎯 Trading Terminal - Updated Architecture

## Current Setup

### ✅ Credentials (Stored in ENV)
- **Consumer Key**: `c63d7961-e935-4bce-8183-c63d9d2342f0`
- **Mobile Number**: `+916375922829`
- **UCC**: `V2Q1T`
- **MPIN**: `654321`

These are now hardcoded in `.env` - no need to enter them in login form.

---

## Page Structure

### 1. **Landing Page** → Dashboard Tab (Default)
- Order summary widgets (Total Trades, Win Rate, Net P&L, Avg Profit)
- Profit & Loss breakdown
- Order summary stats
- **Recent orders table** (pulls from Supabase DB)

### 2. **Trading Tab** (Unlock via Login Button)
- Connection status
- Quick Trade interface (Buy/Sell)
- Positions list
- Kill Switch button

### 3. **Login Modal** (Button in Header)
- **Only asks for TOTP** (6-digit code from authenticator app)
- Auto-fills Consumer Key, Mobile, UCC from env
- Then asks for MPIN
- On success → Unlock Trading tab

---

## Database Integration

### Historical Data Source: Supabase
All order and trade data comes from database tables:

```sql
-- Tables that store historical data:
- trade_logs       // Individual trades (symbol, price, P&L, timestamp)
- positions        // Current open positions
- daily_stats      // Pre-aggregated daily statistics (view)
```

### Data Service: `TradingDataService`
```typescript
getTradingDataService()
  .getAggregatedStats()     // Total trades, P&L, win rate
  .getTradeHistory()        // All past trades
  .getDailyStats()          // Daily performance
  .getSymbolTrades()        // Trades for specific stock
  .addTradeLog()            // Store new trade
  .updateTradePnL()         // Update P&L after closing
```

Dashboard automatically fetches and displays this data on load.

---

## Authentication Flow (Simplified)

```
1. User clicks "Login" button → Modal opens
2. Modal automatically loads credentials from env
3. User enters TOTP from authenticator app
   ↓
4. System sends: { mobileNumber, ucc, totp }
   ↓ (Step 2a: Kotak API)
5. Get: { viewToken, viewSid }
   ↓
6. User enters MPIN
   ↓
7. System sends: { mpin } with viewToken/viewSid
   ↓ (Step 2b: Kotak API)
8. Get: { tradingToken, tradingSid, baseUrl }
   ↓
9. Store session → Unlock Trading tab ✅
```

---

## File Structure

```
src/
├── app/
│   └── page.tsx                    # Main page (Dashboard + Trading tabs)
├── components/
│   ├── Dashboard.tsx               # Order/performance widgets + DB data
│   ├── TradingPanel.tsx            # Trading interface wrapper
│   ├── QuickTrade_v2.tsx           # Buy/Sell/Kill switch
│   └── KotakNeoLogin.tsx           # TOTP + MPIN modal (credentials from env)
├── hooks/
│   └── useKotakTrading.ts          # React hook for trading ops
├── lib/
│   ├── services/
│   │   ├── KotakAuthService.ts     # TOTP + MPIN auth (uses env creds)
│   │   ├── KotakTradingService.ts  # Trading interface
│   │   └── TradingDataService.ts   # Fetch historical data from Supabase ✨
│   ├── brokers/
│   │   ├── KotakNeoAdapter.ts      # API implementation
│   │   └── BrokerFactory.ts
│   └── supabase/
│       └── client.ts
├── types/
│   └── kotak.types.ts
└── .env                             # Credentials stored here
```

---

## Environment Variables

```env
# .env
ACTIVE_BROKER=KOTAK_NEO
KOTAK_CONSUMER_KEY=c63d7961-e935-4bce-8183-c63d9d2342f0
KOTAK_MOBILE_NUMBER=+916375922829
KOTAK_UCC=V2Q1T
KOTAK_MPIN=654321

# Supabase (for historical data)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
```

---

## How to Use

### 1. **View Dashboard** (No Login Required)
- Open app → See Dashboard tab
- Shows aggregated stats (if you have trades in DB)
- Shows recent orders from database

### 2. **Enable Trading** (Login Required)
- Click "Login" button → Modal appears
- Enter TOTP from authenticator app
- Enter MPIN
- ✅ Trading tab unlocks
- Buy/Sell/Kill Switch enabled

### 3. **Add Trade History to DB**
Database should already have trades, but to add new ones:

```typescript
const dataService = getTradingDataService();

await dataService.addTradeLog({
  order_id: "ORD123",
  symbol: "INFY",
  exchange: "NSE",
  side: "BUY",
  quantity: 5,
  price: 1850.50,
  pnl: 450,
  timestamp: new Date().toISOString(),
  broker_name: "KOTAK_NEO"
});
```

---

## Key Features

✅ **Dashboard First** - See your performance metrics immediately
✅ **Simplified Login** - Only TOTP + MPIN (credentials from env)
✅ **Database Driven** - Historical data from Supabase
✅ **Live Trading** - Real orders via Kotak Neo API
✅ **Responsive UI** - Tabs, modals, widgets
✅ **Production Ready** - Built and tested

---

## Next Steps

1. **Set Supabase Variables** in `.env`
2. **Add some trades to `trade_logs` table** (for demo data)
3. **Run the app** and test:
   - Dashboard loads with stats
   - Login modal works
   - Trading tab unlocks
   - Can place orders

That's it! 🚀
