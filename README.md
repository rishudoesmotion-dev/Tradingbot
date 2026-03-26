// README.md
# Trading Terminal - Professional Derivatives Trading Platform

A professional trading terminal built with **Next.js**, **Clean Architecture**, and strict **Risk Management**. Currently supports Kotak Neo API with a broker-agnostic architecture for easy extensibility.

## 🏗️ Architecture

### Clean Architecture Layers

```
┌─────────────────────────────────────────────┐
│            UI Layer (Next.js)               │
│  - Components, Pages, State Management      │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│         Business Logic Layer                │
│  - Risk Manager (Money Management)          │
│  - Trading Rules & Validations              │
│  - Options Chain Analysis                   │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│      Infrastructure Layer                   │
│  - Broker Adapters (Kotak Neo)              │
│  - Database (Supabase PostgreSQL)           │
│  - WebSocket Services for Live Data         │
└─────────────────────────────────────────────┘
```

## 🚀 Features

### ✅ Risk Management (Money Management Engine)
- ✅ **Trade Counter**: Limits maximum 3 trades per day
- ✅ **Loss Guard**: Auto-blocks trading when loss limit is reached
- ✅ **Lot Size Validator**: Enforces 1 lot per order maximum
- ✅ **Concurrent Positions**: No concurrent live trades allowed
- ✅ **Kill Switch**: Emergency button to exit all positions
- ✅ **Master Control**: Rule -1 must be enabled to trade

### ✅ Trading Features
- ✅ Real-time Options Chain with Greeks
- ✅ Live Position Tracking with P&L
- ✅ NIFTY Options (CE/PE) Trading
- ✅ One-Click Trading with preset lot sizes
- ✅ Real-time Statistics Dashboard
- ✅ Daily P&L Calendar View
- ✅ WebSocket support for live market data
- ✅ Login/Authentication with Kotak Neo
- ✅ Account Balance & Position Monitoring

### ✅ Broker Support
- ✅ **Kotak Neo (Kotak Securities)** - Fully implemented
- 🔄 **Other Brokers** - Extensible architecture ready

## 📦 Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, Shadcn/UI
- **State Management**: Custom React Hooks
- **Real-time Data**: WebSocket (Kotak Neo WebSocket SDK)
- **Database**: Supabase (PostgreSQL)
- **API Integration**: Kotak Neo REST & WebSocket APIs
- **Deployment**: Vercel (Frontend)

## 🛠️ Setup Instructions

### 1. Prerequisites

```bash
Node.js >= 18.x
npm or yarn
Supabase account
Kotak Securities account with NEO trading terminal
Kotak Neo API credentials
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure your environment variables:

```env
# Kotak Neo Credentials
NEXT_PUBLIC_KOTAK_NEO_API_URL=https://api.kotaksecurities.com
KOTAK_NEO_USER_ID=your_user_id
KOTAK_NEO_PASSWORD=your_password
KOTAK_NEO_2FA=your_2fa_code
KOTAK_NEO_CONSUMER_KEY=your_consumer_key
KOTAK_NEO_CONSUMER_SECRET=your_consumer_secret
KOTAK_NEO_REDIRECT_URL=http://localhost:3000/auth/callback

# Risk Management Rules
MAX_TRADES_PER_DAY=3
MAX_LOSS_LIMIT=5000
MAX_LOTS=1

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Database Setup

1. Create a Supabase project
2. Run all SQL schema files from `supabase/` folder in your Supabase SQL editor:
   - `scrip_master_schema.sql` - Instrument master data
   - `positions_schema.sql` - Current open positions (NEW - required for position tracking)
   - `SETUP_TRADING_RULES.sql` - Trading rules configuration
   - `trades_schema.sql` - Trade history and logging
3. Update your `.env.local` with Supabase credentials

**Important**: Make sure to run these in order in your Supabase SQL editor:
1. Go to https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new
2. Copy & paste each schema file and execute
3. Verify all tables are created successfully

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                 # Main trading dashboard
│   ├── debug/                   # Debug pages
│   └── api/                     # API routes
├── components/                  # React components
│   ├── Dashboard.tsx            # Performance metrics
│   ├── TradingPanel.tsx         # Main trading interface
│   ├── TradingStatusBanner.tsx  # Trading status with rules
│   ├── KotakNeoLogin.tsx        # Authentication
│   ├── trading/
│   │   ├── Watchlist.tsx       # Instrument selection
│   │   ├── OrderForm.tsx       # Order placement
│   │   ├── PositionsTable.tsx  # Open positions
│   │   └── OrdersTable.tsx     # Order history
│   ├── OptionsChain.tsx        # Options chain view
│   └── ui/                      # Shadcn/UI components
├── lib/
│   ├── services/               # Business logic
│   │   ├── KotakTradingService.ts
│   │   ├── TradingRulesService.ts
│   │   ├── TradesService.ts
│   │   ├── PerformanceMetricsService.ts
│   │   └── ScripSearchService.ts
│   ├── risk/                   # Risk management
│   │   └── RiskManager.ts
│   ├── utils/                  # Utility functions
│   │   ├── marketHours.ts
│   │   └── validation.ts
│   └── hooks/                  # Custom React hooks
│       └── useKotakTrading.ts
├── store/                      # State management
│   └── tradingStore.ts
└── types/                      # TypeScript types
    ├── kotak.types.ts
    ├── trading.types.ts
    └── common.types.ts
```

## 🎯 How It Works

### Trading Rules

All trades are subject to strict trading rules:
- **Only NIFTY Options (CE/PE)** - No other instruments allowed
- **Max 1 lot per order** - Prevents over-leverage
- **Max 3 trades per day** - Risk control
- **No concurrent live trades** - One position at a time
- **Master switch required** - Rule -1 must be enabled

### Order Flow

```
User Authenticates with Kotak Neo
  ↓
User selects NIFTY Option (CE/PE)
  ↓
User places order
  ↓
Trading Rules Engine validates:
  ├─ Check rule status (Master switch enabled)
  ├─ Check daily trade count
  ├─ Check concurrent positions
  ├─ Check loss limit
  └─ Check lot size (max 1)
  ↓
If valid → Kotak Neo places order
  ↓
Order logged in Supabase
  ↓
Position tracked in real-time
  ↓
P&L calculated and displayed
```

### Trading Rules Tooltip

A handy tooltip near the "Trading ON/OFF" status shows:
- ✓ Only NIFTY Options (CE/PE)
- ✓ Max 1 lot per order
- ✓ Max 3 trades per day
- ✓ No concurrent live trades
- Master switch (Rule -1) must be enabled to trade

## 🔒 Risk Management Rules

| Rule | Value | Description |
|------|-------|-------------|
| Max Trades/Day | 3 | Maximum number of trades per day |
| Max Loss Limit | ₹5,000 | Maximum loss before trading disabled |
| Max Lots | 1 | Maximum lot size per order |
| Instrument | NIFTY CE/PE | Only NIFTY options allowed |
| Concurrent Positions | 1 | No concurrent live trades |
| Master Switch | Rule -1 | Must be enabled to trade |

## 📊 Dashboard Features

### Performance Metrics
- **Total Trades**: Number of trades executed
- **Win Rate**: Percentage of profitable trades
- **Net P&L**: Current profit/loss
- **Daily Stats**: Today's performance vs Overall
- **Daily P&L Calendar**: Month view with daily P&L

### Position Management
- Real-time position list with LTP
- Current P&L per position
- Quick exit buttons
- Position quantity and entry price

### Order Tracking
- Order history with timestamps
- Order status (Pending, Filled, Rejected)
- Order prices and quantities

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

## 🚨 Kill Switch

The Kill Switch is automatically triggered when:
- Daily loss exceeds the configured limit
- Manually triggered by the user

When activated:
1. All open positions are closed immediately
2. New order placement is disabled
3. User must manually deactivate to resume trading

## 📈 Adding a New Broker

1. Create a new service in `src/lib/services/`:

```typescript
export class NewBrokerTradingService {
  async authenticate(credentials: Credentials): Promise<Session> {
    // Implement broker auth
  }
  
  async placeOrder(order: OrderRequest): Promise<Order> {
    // Implement order placement
  }
  
  // Implement other methods...
}
```

2. Update the trading panel to use the new broker service

3. Update environment variables for new broker credentials

## 🚀 Deployment

### Vercel (Frontend)

```bash
vercel --prod
```

### Environment Variables on Vercel

1. Go to Project Settings → Environment Variables
2. Add all variables from `.env.local`
3. Redeploy

## 📝 License

Proprietary - All rights reserved

## ⚠️ Disclaimer

This is a real money trading platform. Use at your own risk. Always test thoroughly in paper trading mode before using real money. The authors are not responsible for any financial losses. Trading derivatives is high-risk and may result in substantial losses.

## 📧 Support

For questions or issues, please contact the development team.

---

Built with ❤️ using Clean Architecture principles & Risk Management Best Practices
