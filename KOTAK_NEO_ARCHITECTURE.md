# Kotak Neo Integration - Architecture Overview

## System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  React Components (TradingDashboard, KillSwitch, OrderBook)  │   │
│  │  - ConnectionStatus.tsx                                      │   │
│  │  - QuickTrade.tsx                                            │   │
│  │  - PositionBook.tsx                                          │   │
│  │  - KillSwitch.tsx                                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Store Layer (Zustand)                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  tradingStore.ts                                             │   │
│  │  - Manages broker instance                                   │   │
│  │  - Caches positions, orders, balance                         │   │
│  │  - Handles real-time updates                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Factory Pattern Layer                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  BrokerFactory.ts                                            │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ createBroker(type, credentials) -> BaseBroker       │   │   │
│  │  │ createFromEnv() -> BaseBroker                       │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │   Shoonya        │  │   Kotak Neo      │  │   Zerodha        │
    │   Adapter        │  │   Adapter        │  │   Adapter        │
    │                  │  │  (NEW!)          │  │   (Future)       │
    └──────────────────┘  └──────────────────┘  └──────────────────┘
                 │                  │                  │
                 └──────────────────┼──────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Abstract Broker Base Class                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  BaseBroker.ts                                               │   │
│  │  - authenticate(): Promise<boolean>                          │   │
│  │  - placeOrder(request): Promise<Order>                       │   │
│  │  - cancelOrder(orderId): Promise<boolean>                    │   │
│  │  - modifyOrder(orderId, changes): Promise<Order>             │   │
│  │  - getOrders(): Promise<Order[]>                             │   │
│  │  - getPositions(): Promise<Position[]>                       │   │
│  │  - exitPosition(symbol): Promise<Order>                      │   │
│  │  - exitAllPositions(): Promise<Order[]>                      │   │
│  │  - getBalance(): Promise<number>                             │   │
│  │  - getLTP(symbol, exchange): Promise<number>                 │   │
│  │  - getMarketDepth(symbol, exchange): Promise<MarketDepth>    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Kotak Neo Adapter Implementation Layer                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  KotakNeoAdapter.ts (extends BaseBroker)                     │   │
│  │                                                              │   │
│  │  Authentication Methods:                                     │   │
│  │  - authenticate()          ← calls validateTotp + validateMpin  │
│  │  - validateTotp()          ← sends TOTP validation request  │   │
│  │  - validateMpin()          ← sends MPIN validation request  │   │
│  │                                                              │   │
│  │  Order Management Methods:                                   │   │
│  │  - placeOrder()            ← creates order via API          │   │
│  │  - modifyOrder()           ← modifies existing order        │   │
│  │  - cancelOrder()           ← cancels order                  │   │
│  │  - exitPosition()          ← exits single position          │   │
│  │  - exitAllPositions()      ← kill switch functionality      │   │
│  │                                                              │   │
│  │  Reporting Methods:                                          │   │
│  │  - getOrders()             ← fetches order book             │   │
│  │  - getPositions()          ← fetches positions              │   │
│  │  - getBalance()            ← fetches account balance        │   │
│  │  - getLTP()                ← fetches last traded price      │   │
│  │  - getMarketDepth()        ← fetches market depth           │   │
│  │                                                              │   │
│  │  Helper Methods:                                             │   │
│  │  - mapOrderRequest()       ← converts to Kotak format       │   │
│  │  - mapOrderResponse()      ← converts from Kotak format     │   │
│  │  - mapExchange()           ← maps exchange codes            │   │
│  │  - unmapExchange()         ← reverses exchange mapping      │   │
│  │  - mapOrderStatus()        ← maps order status              │   │
│  │                                                              │   │
│  │  Session Management:                                         │   │
│  │  - session: KotakSession   ← stores auth tokens             │   │
│  │  - disconnect()            ← cleans up session              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Type Definition Layer                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  kotak.types.ts - Kotak Neo Specific Types                   │   │
│  │  ├── Authentication Types                                    │   │
│  │  │   ├── KotakLoginRequest                                   │   │
│  │  │   ├── KotakTotpValidationResponse                         │   │
│  │  │   ├── KotakMpinValidateRequest                            │   │
│  │  │   ├── KotakMpinValidateResponse                           │   │
│  │  │   ├── KotakSession                                        │   │
│  │  │   └── KotakSessionConfig                                  │   │
│  │  │                                                            │   │
│  │  ├── Order Management Types                                  │   │
│  │  │   ├── KotakOrderRequest                                   │   │
│  │  │   ├── KotakOrderResponse                                  │   │
│  │  │   ├── KotakModifyOrderRequest                             │   │
│  │  │   └── KotakCancelOrderRequest                             │   │
│  │  │                                                            │   │
│  │  ├── Report Types                                            │   │
│  │  │   ├── KotakOrderBookResponse                              │   │
│  │  │   ├── KotakTradeBookResponse                              │   │
│  │  │   ├── KotakPositionBookResponse                           │   │
│  │  │   ├── KotakHoldingsResponse                               │   │
│  │  │   └── KotakHolding                                        │   │
│  │  │                                                            │   │
│  │  ├── Risk Management Types                                   │   │
│  │  │   ├── KotakCheckMarginRequest                             │   │
│  │  │   ├── KotakLimitsRequest                                  │   │
│  │  │   └── KotakLimitsResponse                                 │   │
│  │  │                                                            │   │
│  │  └── Enums                                                   │   │
│  │      ├── KotakExchange (nse_cm, nse_fo, bse_cm, etc)        │   │
│  │      ├── KotakProductCode (CNC, NRML, MIS, BO, CO)           │   │
│  │      ├── KotakTransactionType (B, S)                         │   │
│  │      └── KotakPriceType (L, M)                               │   │
│  │                                                              │   │
│  │  broker.types.ts - Standard Broker Types (used by all)      │   │
│  │  ├── OrderType (MARKET, LIMIT, SL, SL_M)                    │   │
│  │  ├── OrderSide (BUY, SELL)                                   │   │
│  │  ├── ProductType (INTRADAY, DELIVERY, MARGIN)                │   │
│  │  ├── OrderStatus (PENDING, OPEN, COMPLETE, etc)              │   │
│  │  ├── OrderRequest                                            │   │
│  │  ├── Order                                                    │   │
│  │  ├── Position                                                │   │
│  │  ├── MarketDepth                                             │   │
│  │  └── BrokerCredentials                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      External API Layer                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Kotak Neo REST API                                          │   │
│  │  https://mis.kotaksecurities.com                             │   │
│  │                                                              │   │
│  │  Endpoints:                                                  │   │
│  │  ├── POST /login/1.0/tradeApiLogin       (TOTP)             │   │
│  │  ├── POST /login/1.0/tradeApiValidate    (MPIN)             │   │
│  │  ├── POST {baseUrl}/quick/order/rule/ms/place (Orders)     │   │
│  │  ├── POST {baseUrl}/quick/order/vr/modify                   │   │
│  │  ├── POST {baseUrl}/quick/order/cancel                      │   │
│  │  ├── GET {baseUrl}/quick/user/orders                        │   │
│  │  ├── GET {baseUrl}/quick/user/positions                     │   │
│  │  ├── GET {baseUrl}/quick/user/trades                        │   │
│  │  ├── POST {baseUrl}/quick/user/limits                       │   │
│  │  └── GET {baseUrl}/script-details/1.0/quotes/neosymbol/{exchange}
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Kotak Neo Servers                             │
│  ├── Authentication Server                                          │
│  ├── Trading Server                                                 │
│  ├── Reporting Server                                               │
│  └── Market Data Server                                             │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Authentication Flow
```
User
  │
  ├─ Enters TOTP/MPIN ──→ Component State
  │
  └─ Calls broker.authenticate()
     │
     ├─ validateTotp()
     │  ├─ POST /login/1.0/tradeApiLogin
     │  ├─ Kotak Neo Server
     │  └─ Response: { token (viewToken), sid (sidView) }
     │
     └─ validateMpin()
        ├─ POST /login/1.0/tradeApiValidate
        ├─ Kotak Neo Server  
        └─ Response: { token (sessionToken), sid, baseUrl }
        
     └─ Store Session in KotakSession object
        ├─ sessionToken
        ├─ sid
        └─ baseUrl
```

### Order Placement Flow
```
User Input (Symbol, Qty, Price, Type)
  │
  └─ Component calls broker.placeOrder(orderRequest)
     │
     ├─ mapOrderRequest()
     │  └─ Convert OrderRequest → KotakOrderRequest
     │
     └─ POST {baseUrl}/quick/order/rule/ms/place
        │
        ├─ Headers: { Sid, Auth (sessionToken) }
        ├─ Body: jData (JSON-encoded Kotak order)
        │
        └─ Kotak Neo Server
           │
           └─ Response: { stat, nOrdNo (orderId), ... }
              │
              └─ mapOrderResponse()
                 └─ Convert KotakOrderResponse → Order
                    │
                    └─ Return Order object to UI
                       │
                       └─ Store in Zustand store
                          │
                          └─ Update UI (positions, P&L, etc)
```

### Position Exit Flow (Kill Switch)
```
User clicks "Kill Switch" button
  │
  └─ Calls broker.exitAllPositions()
     │
     ├─ getPositions() 
     │  ├─ GET {baseUrl}/quick/user/positions
     │  └─ Returns array of Position objects
     │
     ├─ For each position:
     │  └─ exitPosition(symbol, productType)
     │     │
     │     ├─ Determine transaction type (BUY if short, SELL if long)
     │     ├─ Create market order
     │     │
     │     └─ placeOrder()
     │        ├─ POST {baseUrl}/quick/order/rule/ms/place
     │        └─ Returns Order with orderId
     │
     └─ Return array of exit orders
        │
        └─ Update UI with exit status
```

### Real-time Position Updates
```
Polling Mechanism (every N seconds)
  │
  └─ Component useEffect
     │
     └─ broker.getPositions()
        │
        ├─ GET {baseUrl}/quick/user/positions
        └─ Kotak Neo Server
           │
           └─ Response: Position array
              │
              ├─ Calculate P&L
              ├─ Update store
              └─ Re-render UI
```

## State Management Flow

```
┌─────────────────────────────────────────────────────────────┐
│              Zustand Trading Store                          │
├─────────────────────────────────────────────────────────────┤
│  state:                                                     │
│  ├── broker: BaseBroker                                    │
│  ├── positions: Position[]                                 │
│  ├── orders: Order[]                                       │
│  ├── balance: number                                       │
│  ├── isConnected: boolean                                  │
│  └── isLoading: boolean                                    │
│                                                             │
│  actions:                                                   │
│  ├── setBroker(broker)                                     │
│  ├── connect()                                             │
│  ├── disconnect()                                          │
│  ├── placeOrder(request)                                   │
│  ├── cancelOrder(orderId)                                  │
│  ├── getPositions()                                        │
│  ├── exitAllPositions()                                    │
│  └── updateBalance()                                       │
└─────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
API Call (e.g., placeOrder)
  │
  ├─ Try Block
  │  └─ Execution successful
  │     └─ Return result
  │
  └─ Catch Block
     │
     ├─ Error Classification
     │  ├─ Authentication Error
     │  │  └─ Trigger re-authentication
     │  ├─ Validation Error
     │  │  └─ Show user-friendly message
     │  ├─ Network Error
     │  │  └─ Implement retry logic
     │  └─ API Error
     │     └─ Log and notify
     │
     └─ Error Propagation
        └─ Throw to caller for handling
           │
           └─ UI displays error notification
```

## Session Lifecycle

```
┌────────────────┐
│  Not Connected │
└────────┬───────┘
         │
         └─ authenticate()
            │
            ├─ validateTotp()
            ├─ validateMpin()
            └─ Store session tokens
               │
               ▼
         ┌──────────────┐
         │  Connected   │ ──→ Can place orders, view positions
         └──────────────┘
               │
               ├─ API call successful
               │  └─ Continue using session
               │
               ├─ Session expired (401)
               │  └─ Re-authenticate
               │
               └─ disconnect()
                  │
                  ▼
         ┌────────────────┐
         │  Not Connected │
         └────────────────┘
```

---

**Last Updated**: February 25, 2026  
**Version**: 1.0.0
