# 🏗️ Trading Terminal - Architecture Documentation

## System Overview

This trading terminal follows **Clean Architecture** principles with strict separation of concerns. The system is designed to be:

- ✅ **Broker-agnostic**: Easy to switch between Shoonya, Zerodha, or any broker
- ✅ **Risk-first**: All orders pass through risk validation before execution
- ✅ **Scalable**: Modular design allows easy feature additions
- ✅ **Type-safe**: Full TypeScript for compile-time safety

## Architecture Layers

### 1. Presentation Layer (UI)
**Location**: `src/app/`, `src/components/`

**Responsibilities**:
- Render trading interface
- Handle user interactions
- Display real-time data
- Manage local UI state

**Key Components**:
```typescript
TradingDashboard     // Main trading interface
├── OrderBook        // Display all orders
├── PositionBook     // Show positions with P&L
├── QuickTrade       // One-click trading panel
├── StatsPanel       // Daily stats dashboard
└── KillSwitch       // Emergency exit button
```

**State Management**: Zustand (`src/store/tradingStore.ts`)
- Centralized application state
- Reactive updates
- Minimal boilerplate

### 2. Business Logic Layer
**Location**: `src/lib/risk/`

**Responsibilities**:
- Enforce trading rules
- Risk validation
- Money management
- Trade logging

**Core Component**: `RiskManager`

```typescript
class RiskManager {
  validateOrder()       // Pre-trade risk checks
  getDayStats()         // Trading statistics
  logTrade()            // Persist trade data
  shouldActivateKillSwitch() // Auto-protection
}
```

**Validation Rules**:
1. **Trade Counter**: Max trades per day
2. **Loss Guard**: Max loss limit
3. **Lot Validator**: Max position size
4. **Kill Switch**: Emergency stop

### 3. Infrastructure Layer
**Location**: `src/lib/brokers/`, `src/lib/supabase/`, `src/lib/websocket/`

#### 3.1 Broker Abstraction

**Pattern**: Adapter Pattern

```typescript
BaseBroker (Abstract)
├── authenticate()
├── placeOrder()
├── cancelOrder()
├── getPositions()
├── getLTP()
└── exitAllPositions()

Implementations:
├── ShoonyaAdapter   ✅ Done
└── ZerodhaAdapter   🔄 Coming soon
```

**Factory Pattern**:
```typescript
BrokerFactory.createBroker(BrokerType.SHOONYA, credentials)
```

#### 3.2 Database Layer

**Technology**: Supabase (PostgreSQL)

**Schema**:
```sql
risk_config          // Risk management settings
trade_logs           // All executed trades
positions            // Current open positions
daily_stats (view)   // Aggregated statistics
```

#### 3.3 Real-time Data

**Technology**: Socket.io + WebSocket

**Flow**:
```
Shoonya WebSocket → WS Server (Port 3001) → Socket.io → Frontend
```

## Data Flow

### Order Placement Flow

```
┌─────────────┐
│ User clicks │
│ "BUY" button│
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ TradingStore.placeOrder │
└──────────┬──────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Check Kill Switch Status     │
│ (Trading disabled?)          │
└──────────┬───────────────────┘
           │ ✅ Active
           ▼
┌──────────────────────────────┐
│ RiskManager.validateOrder    │
│ ├─ Check trade count         │
│ ├─ Check loss limit          │
│ ├─ Check lot size            │
│ └─ Check position size       │
└──────────┬───────────────────┘
           │ ✅ Valid
           ▼
┌──────────────────────────────┐
│ BrokerAdapter.placeOrder     │
│ (Shoonya/Zerodha/etc.)       │
└──────────┬───────────────────┘
           │ ✅ Order placed
           ▼
┌──────────────────────────────┐
│ RiskManager.logTrade         │
│ (Save to database)           │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Update UI State              │
│ ├─ Refresh orders            │
│ ├─ Update stats              │
│ └─ Check kill switch trigger │
└──────────────────────────────┘
```

### Real-time Market Data Flow

```
┌──────────────────┐
│ Shoonya Exchange │
└────────┬─────────┘
         │ WebSocket
         ▼
┌──────────────────┐
│ WS Server        │
│ (Node.js/Express)│
└────────┬─────────┘
         │ Socket.io
         ▼
┌──────────────────┐
│ WebSocketService │
│ (Frontend)       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ TradingStore     │
│ .updateMarketData│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ UI Components    │
│ (Auto re-render) │
└──────────────────┘
```

## Design Patterns Used

### 1. Adapter Pattern
**Purpose**: Make different broker APIs work with a unified interface

```typescript
// Any broker can be swapped without changing app code
const broker: BaseBroker = BrokerFactory.createBroker(type, credentials);
```

### 2. Factory Pattern
**Purpose**: Centralize broker instance creation

```typescript
BrokerFactory.createBroker(BrokerType, credentials)
BrokerFactory.createFromEnv()
```

### 3. Repository Pattern
**Purpose**: Abstract database operations

```typescript
RiskManager
  .loadConfig()      // Read from DB
  .saveConfig()      // Write to DB
  .logTrade()        // Insert trade
  .getDayStats()     // Query stats
```

### 4. Singleton Pattern
**Purpose**: Single WebSocket connection

```typescript
const wsService = getWebSocketService(); // Always same instance
```

## Error Handling Strategy

### 1. Order Validation Errors
**Level**: Business Logic  
**Handler**: RiskManager  
**Result**: Return validation errors to UI

```typescript
const validation = await riskManager.validateOrder(order);
if (!validation.isValid) {
  // Show errors to user, don't place order
  showError(validation.errors.join(', '));
}
```

### 2. Broker API Errors
**Level**: Infrastructure  
**Handler**: BrokerAdapter  
**Result**: Throw exception, caught by TradingStore

```typescript
try {
  await broker.placeOrder(order);
} catch (error) {
  // Log error, show user-friendly message
  setError(`Order failed: ${error.message}`);
}
```

### 3. Database Errors
**Level**: Infrastructure  
**Handler**: RiskManager  
**Result**: Log to console, use fallback values

```typescript
try {
  await supabase.from('trade_logs').insert(trade);
} catch (error) {
  console.error('Failed to log trade:', error);
  // Continue execution (non-critical)
}
```

## Security Considerations

### 1. Environment Variables
**Never commit**:
- API keys
- Database credentials
- Broker secrets

Use `.env.local` (gitignored)

### 2. Supabase RLS (Row Level Security)
```sql
CREATE POLICY "authenticated_users_only" 
ON trade_logs FOR ALL 
USING (auth.role() = 'authenticated');
```

### 3. Kill Switch Protection
- Automatic activation on loss limit
- Manual override available
- Blocks all new orders when active

## Performance Optimizations

### 1. State Management
**Zustand** instead of Redux:
- Smaller bundle size
- Less boilerplate
- Better performance for real-time updates

### 2. Database Queries
**Indexes on**:
- `trade_logs.timestamp`
- `trade_logs.symbol`
- `positions.symbol`

### 3. WebSocket Subscriptions
**Lazy loading**:
- Only subscribe to active symbols
- Unsubscribe when component unmounts

## Testing Strategy

### 1. Unit Tests
**Target**: Business logic

```typescript
// RiskManager validation
test('should block order when trade limit exceeded', async () => {
  const validation = await riskManager.validateOrder(order);
  expect(validation.isValid).toBe(false);
  expect(validation.errors).toContain('trade limit');
});
```

### 2. Integration Tests
**Target**: Broker adapters

```typescript
test('should place order via Shoonya', async () => {
  const order = await shoonyaAdapter.placeOrder(request);
  expect(order.orderId).toBeDefined();
});
```

### 3. E2E Tests
**Target**: Full user flows

```typescript
test('complete order flow with risk validation', async () => {
  // 1. Connect to broker
  // 2. Place order
  // 3. Verify risk checks
  // 4. Confirm order placement
  // 5. Check database logs
});
```

## Deployment Architecture

### Production Setup

```
┌─────────────────────────────────────────┐
│           Vercel (Frontend)             │
│  - Next.js App                          │
│  - Static Assets                        │
│  - API Routes                           │
└────────┬────────────────────────────────┘
         │
         ├──────────► Supabase (Database)
         │              - PostgreSQL
         │              - Real-time subscriptions
         │
         └──────────► Railway/Render (WS Server)
                        - WebSocket connections
                        - Broker data streaming
```

### Environment Variables by Service

**Vercel (Frontend)**:
```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_WS_SERVER_URL
```

**Railway (WebSocket Server)**:
```env
SHOONYA_USER_ID
SHOONYA_API_KEY
SHOONYA_VENDOR_CODE
SHOONYA_API_SECRET
PORT=3001
```

## Future Enhancements

### Phase 2 Features
- [ ] Multiple broker support (Zerodha, Alice Blue)
- [ ] Advanced charting (TradingView integration)
- [ ] Backtesting engine
- [ ] Algorithmic trading strategies
- [ ] Mobile app (React Native)

### Phase 3 Features
- [ ] Multi-user support (Teams)
- [ ] Strategy marketplace
- [ ] AI-powered trade suggestions
- [ ] Voice commands
- [ ] Telegram/Discord notifications

## Monitoring & Logging

### Application Logs
```typescript
// Structured logging
logger.info('Order placed', {
  orderId: order.orderId,
  symbol: order.symbol,
  quantity: order.quantity,
  timestamp: new Date()
});
```

### Metrics to Track
- Orders per minute
- Average order execution time
- Risk validation rejection rate
- Kill switch activation frequency
- WebSocket connection stability

### Error Tracking
- Use Sentry for production
- Track broker API failures
- Database connection issues
- WebSocket disconnections

## Contributing Guidelines

### Code Structure
1. Keep layers separate
2. Use TypeScript strictly
3. Write tests for critical paths
4. Document complex logic

### Naming Conventions
- **Files**: PascalCase for components, camelCase for utilities
- **Classes**: PascalCase
- **Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE

### Git Workflow
```bash
main (production)
└── develop (staging)
    └── feature/broker-zerodha
    └── feature/advanced-charts
    └── bugfix/order-validation
```

---

**Last Updated**: 2026-02-24  
**Version**: 1.0.0  
**Maintainer**: Trading Terminal Team
