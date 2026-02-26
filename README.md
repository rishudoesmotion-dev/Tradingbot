// README.md
# Trading Terminal - Broker-Agnostic Platform

A professional trading terminal built with **Next.js**, **Clean Architecture**, and strict **Risk Management**. Currently supports Shoonya API with easy extensibility to other brokers.

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
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│      Infrastructure Layer                   │
│  - Broker Adapters (Shoonya, Zerodha, etc.) │
│  - Database (Supabase)                      │
│  - WebSocket Services                       │
└─────────────────────────────────────────────┘
```

## 🚀 Features

### ✅ Risk Management (Money Management Engine)
- ✅ **Trade Counter**: Limits maximum trades per day
- ✅ **Loss Guard**: Auto-blocks trading when loss limit is reached
- ✅ **Lot Size Validator**: Enforces position size limits
- ✅ **Kill Switch**: Emergency button to exit all positions

### ✅ Trading Features
- ✅ Real-time Order Book
- ✅ Live Position Tracking with P&L
- ✅ One-Click Trading with preset lot sizes
- ✅ Real-time Statistics Dashboard
- ✅ WebSocket support for market data

### ✅ Broker Support
- ✅ **Shoonya (Finvasia)** - Fully implemented
- 🔄 **Zerodha** - Coming soon
- 🔄 **Others** - Extensible architecture

## 📦 Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS, Shadcn/UI
- **State Management**: Zustand
- **Real-time Data**: Socket.io, WebSockets
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel (Frontend), Railway/Render (WebSocket Server)

## 🛠️ Setup Instructions

### 1. Prerequisites

```bash
Node.js >= 18.x
npm or yarn
Supabase account
Shoonya API credentials
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
# Risk Management
MAX_TRADES_PER_DAY=5
MAX_LOSS_LIMIT=5000
MAX_LOTS=10

# Broker
ACTIVE_BROKER=SHOONYA
SHOONYA_USER_ID=your_user_id
SHOONYA_API_KEY=your_api_key
SHOONYA_VENDOR_CODE=your_vendor_code
SHOONYA_API_SECRET=your_api_secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# WebSocket Server
NEXT_PUBLIC_WS_SERVER_URL=http://localhost:3001
```

### 4. Database Setup

1. Create a Supabase project
2. Run the SQL schema from `supabase/schema.sql` in your Supabase SQL editor
3. Update your `.env.local` with Supabase credentials

### 5. WebSocket Server (Optional)

For real-time market data, you need a separate Node.js server:

```bash
# Create a new directory for the WebSocket server
mkdir ws-server
cd ws-server
npm init -y
npm install express socket.io shoonya-api-js
```

Create `server.js`:

```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('subscribe', ({ symbols }) => {
    // Implement Shoonya WebSocket subscription
    console.log('Subscribing to:', symbols);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(3001, () => {
  console.log('WebSocket server running on port 3001');
});
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Home page
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # Shadcn/UI components
│   ├── TradingDashboard.tsx
│   ├── OrderBook.tsx
│   ├── PositionBook.tsx
│   ├── QuickTrade.tsx
│   ├── StatsPanel.tsx
│   └── KillSwitch.tsx
├── lib/
│   ├── brokers/          # Broker abstraction layer
│   │   ├── BaseBroker.ts         # Abstract base class
│   │   ├── ShoonyaAdapter.ts     # Shoonya implementation
│   │   └── BrokerFactory.ts      # Factory pattern
│   ├── risk/             # Risk management
│   │   └── RiskManager.ts
│   ├── supabase/         # Database client
│   │   └── client.ts
│   └── websocket/        # WebSocket service
│       └── WebSocketService.ts
├── store/                # Zustand stores
│   └── tradingStore.ts
└── types/                # TypeScript types
    ├── broker.types.ts
    └── risk.types.ts
```

## 🎯 How It Works

### Order Flow

```
User clicks "Buy" 
  ↓
Risk Manager validates order
  ├─ Check daily trade limit
  ├─ Check loss limit
  ├─ Check lot size
  └─ Check position size
  ↓
If valid → Broker Adapter places order
  ↓
Order logged in database
  ↓
UI updates with new order/position
  ↓
Check if Kill Switch should activate
```

### Risk Validation Example

```typescript
const validation = await riskManager.validateOrder(orderRequest);

if (!validation.isValid) {
  // Block order
  console.error(validation.errors);
} else {
  // Place order
  await broker.placeOrder(orderRequest);
}
```

## 🔒 Risk Management Rules

| Rule | Default Value | Description |
|------|---------------|-------------|
| Max Trades/Day | 5 | Maximum number of trades allowed per day |
| Max Loss Limit | ₹5,000 | Maximum loss allowed before trading is blocked |
| Max Lots | 10 | Maximum lot size per order |
| Max Position Size | ₹1,00,000 | Maximum position value |

**Note**: These values can be configured in `.env` or updated via the UI.

## 🚨 Kill Switch

The Kill Switch is automatically activated when:
- Daily loss exceeds the configured limit
- Manually triggered by the user

When activated:
1. All open positions are closed immediately
2. New order placement is disabled
3. User must manually deactivate to resume trading

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📈 Adding a New Broker

1. Create a new adapter in `src/lib/brokers/`:

```typescript
import { BaseBroker } from './BaseBroker';

export class ZerodhaAdapter extends BaseBroker {
  async authenticate(): Promise<boolean> {
    // Implement Zerodha auth
  }
  
  async placeOrder(orderRequest: OrderRequest): Promise<Order> {
    // Implement Zerodha order placement
  }
  
  // Implement other methods...
}
```

2. Add to `BrokerFactory.ts`:

```typescript
case BrokerType.ZERODHA:
  return new ZerodhaAdapter(credentials);
```

3. Update environment variables

## 🚀 Deployment

### Vercel (Frontend)

```bash
vercel --prod
```

### Railway/Render (WebSocket Server)

1. Create a new project
2. Deploy the `ws-server` directory
3. Update `NEXT_PUBLIC_WS_SERVER_URL` in Vercel environment variables

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please open an issue or PR.

## ⚠️ Disclaimer

This is a trading platform. Use at your own risk. Always test thoroughly before using real money. The authors are not responsible for any financial losses.

## 📧 Support

For questions or issues, please open a GitHub issue.

---

Built with ❤️ using Clean Architecture principles
