# Trading Terminal - Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies

```powershell
npm install
```

### Step 2: Configure Environment

Create `.env.local` file:

```powershell
cp .env.example .env.local
```

### Step 3: Setup Supabase Database

1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Go to SQL Editor and run the script from `supabase/schema.sql`
4. Go to Settings → API and copy your:
   - Project URL
   - Anon/Public Key
5. Update `.env.local` with these values

### Step 4: Run Development Server

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📝 What's Been Built

### ✅ Core Architecture

- **Broker Abstraction Layer** (`src/lib/brokers/`)
  - `BaseBroker.ts` - Abstract interface for all brokers
  - `ShoonyaAdapter.ts` - Shoonya/Finvasia implementation
  - `BrokerFactory.ts` - Factory pattern for broker creation

- **Risk Management Engine** (`src/lib/risk/`)
  - `RiskManager.ts` - Money management logic
  - Trade counter, loss guard, lot validator
  - Automatic kill switch activation

- **State Management** (`src/store/`)
  - `tradingStore.ts` - Zustand store for global state
  - Centralized order/position management

- **Database Layer** (`src/lib/supabase/`)
  - PostgreSQL schema for trade logs
  - Position tracking
  - Risk configuration storage

### ✅ Features Implemented

1. **Risk Validation**
   - Max trades per day enforcement
   - Loss limit monitoring
   - Position size limits
   - Automatic kill switch

2. **Order Management**
   - Place, cancel, modify orders
   - Order book tracking
   - Real-time status updates

3. **Position Tracking**
   - Live P&L calculation
   - Multiple positions support
   - Exit all positions (Kill Switch)

4. **Database Integration**
   - Trade logging
   - Position persistence
   - Risk config management

## 🔧 Next Steps to Complete

### 1. Install Shadcn/UI Components

The UI components reference Shadcn/UI but they need to be installed:

```powershell
# Install Shadcn/UI CLI
npx shadcn-ui@latest init

# Add required components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add table
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add alert
```

### 2. Complete UI Components

Create the missing component files in `src/components/`:

- `OrderBook.tsx` - Display all orders
- `PositionBook.tsx` - Display positions with P&L
- `QuickTrade.tsx` - One-click trading panel
- `StatsPanel.tsx` - Daily statistics dashboard
- `KillSwitch.tsx` - Emergency exit button

### 3. Setup WebSocket Server (Optional)

For real-time market data:

```powershell
# Create ws-server directory
mkdir ws-server
cd ws-server
npm init -y
npm install express socket.io

# Copy the example server
cp ../ws-server-example.js server.js

# Run the server
node server.js
```

### 4. Connect Real Broker API

Update `ShoonyaAdapter.ts` to use actual Shoonya API:

```typescript
// Uncomment and configure ShoonyaApi-js
npm install shoonya-api-js
```

## 🎯 Testing the System

### Test Risk Validation

```typescript
// In browser console after connecting
const store = useTradingStore.getState();

// Try placing an order
await store.placeOrder({
  symbol: 'NIFTY',
  exchange: 'NFO',
  side: 'BUY',
  quantity: 50,
  orderType: 'MARKET',
  productType: 'INTRADAY'
});

// Check if risk validation worked
const stats = await store.dayStats;
console.log(stats);
```

### Test Kill Switch

```typescript
// Activate kill switch manually
await store.activateKillSwitch();

// Try placing an order (should be blocked)
await store.placeOrder({...}); // Should fail
```

## 📊 Database Queries

### Check Today's Trades

```sql
SELECT * FROM trade_logs 
WHERE DATE(timestamp) = CURRENT_DATE
ORDER BY timestamp DESC;
```

### View Risk Configuration

```sql
SELECT * FROM risk_config 
ORDER BY created_at DESC 
LIMIT 1;
```

### Daily Statistics

```sql
SELECT * FROM daily_stats
WHERE trade_date = CURRENT_DATE;
```

## 🐛 Troubleshooting

### Issue: TypeScript Errors

```powershell
# Ensure @types/node is installed
npm install -D @types/node

# Rebuild
npm run build
```

### Issue: Supabase Connection Failed

- Check `.env.local` has correct credentials
- Verify Supabase project is active
- Check RLS policies in Supabase dashboard

### Issue: WebSocket Not Connecting

- Ensure WebSocket server is running on port 3001
- Check `NEXT_PUBLIC_WS_SERVER_URL` in `.env.local`
- Verify CORS is enabled in WebSocket server

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/brokers/BaseBroker.ts` | Broker interface definition |
| `src/lib/risk/RiskManager.ts` | Risk validation logic |
| `src/store/tradingStore.ts` | Global state management |
| `supabase/schema.sql` | Database schema |
| `.env.example` | Configuration template |

## 🎓 Understanding the Flow

```
User Action (Click Buy)
    ↓
TradingStore.placeOrder()
    ↓
RiskManager.validateOrder() ✅
    ├─ Check trade count
    ├─ Check loss limit  
    ├─ Check lot size
    └─ Check position size
    ↓
BrokerAdapter.placeOrder() 📤
    ↓
Log to Database 💾
    ↓
Update UI 🎨
    ↓
Check Kill Switch 🔴
```

## 🎉 You're Ready!

Run `npm run dev` and start building your trading strategy!

Remember: **Always test with paper trading first!**
