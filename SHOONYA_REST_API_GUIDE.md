# Shoonya REST API Integration Guide

## 🎯 Key Insight: NO NPM PACKAGE NEEDED!

Shoonya API is a **pure REST HTTP API** - you just make fetch() calls directly!

### ✅ What We Have
- **Base URL**: `https://api.shoonya.com/NorenWClientTP`
- **Method**: All endpoints use `POST` with JSON payloads
- **Headers**: `Content-Type: application/json`
- **Response Format**: JSON with `stat: 'Ok' | 'Not_Ok'`

### ❌ What We DON'T Need
- ❌ No npm package like "shoonya-api-js"
- ❌ No external dependencies for API calls
- ❌ No "node-fetch" (use native fetch() in Node.js 18+)

---

## 📋 Available Endpoints

### Authentication
```
POST /Login
POST /Logout
```

### Orders
```
POST /PlaceOrder
POST /ModifyOrder
POST /CancelOrder
POST /ExitOrder (for bracket/cover orders)
POST /OrderBook (GET all orders)
POST /TradeBook (GET all trades)
POST /SingleOrderHistory
```

### Positions & Holdings
```
POST /PositionBook (GET all positions)
POST /Holdings
POST /Limits
```

### Market Data
```
POST /SearchScrip (search symbols)
POST /SecurityInfo (get scrip details)
POST /Quotes (get price quotes)
POST /TimePriceSeries (get chart data)
POST /OptionChain
```

### WebSocket (for real-time updates)
```
WebSocket endpoint for market data and order updates
```

---

## 🔐 Authentication Flow

### Step 1: Login
```typescript
const loginPayload = {
  uid: 'YOUR_USER_ID',
  pwd: 'YOUR_PASSWORD',
  vc: 'VENDOR_CODE',           // Provided by broker
  appkey: 'YOUR_API_KEY',      // API Key from broker
  imei: '123456789012345',     // 15-digit device identifier
  factor2: 'OTP_IF_ENABLED',   // Optional: 2FA/OTP
  apkversion: 'your-app:1.0'   // App version string
};

const response = await fetch('https://api.shoonya.com/NorenWClientTP/Login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(loginPayload)
});

const data = await response.json();
// data.susertoken = session token (use in all subsequent calls)
// data.uid = user ID
// data.actid = account ID
```

### Step 2: Store Session Token
```typescript
// Session data to store
{
  susertoken: 'token_from_login_response',
  uid: 'user_id',
  actid: 'account_id',
  loginTime: new Date(),
  expiryTime: new Date(Date.now() + 60*60*1000) // 1 hour
}
```

### Step 3: Use Token in All API Calls
```typescript
// Every subsequent request includes uid and actid
const orderPayload = {
  uid: sessionData.uid,
  actid: sessionData.actid,
  // ... other order fields
};
```

### Step 4: Handle Token Expiry
```typescript
// Token expires after 1 hour
// Implement auto-refresh 5-10 minutes before expiry
if (new Date() > sessionData.expiryTime) {
  // Call Login again to get new token
}
```

---

## 📤 Place Order Example

### Request
```typescript
const placeOrderPayload = {
  uid: 'USER123',
  actid: 'ACCOUNT123',
  
  // Symbol details
  exch: 'NSE',                 // NSE, NFO, BSE, MCX, CDS
  tsym: 'INFY-EQ',             // Trading symbol (exact format!)
  
  // Order details
  qty: '1',                    // Quantity (as string!)
  prc: '1500.00',              // Price (as string!)
  prd: 'C',                    // Product: C=CNC, M=MIS, H=High Leverage, B=Bracket
  prctyp: 'LMT',               // LMT, MKT, SL-LMT, SL-MKT
  ret: 'DAY',                  // Retention: DAY, IOC, EOS
  trantype: 'B',               // B=BUY, S=SELL
  
  // Optional
  dscqty: '0',                 // Disclosed quantity
  trgprc: '1490',              // Trigger price (for SL orders)
  remarks: 'my_order_001',     // Client order ID/tag
};

const response = await fetch('https://api.shoonya.com/NorenWClientTP/PlaceOrder', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(placeOrderPayload)
});

const data = await response.json();
// {
//   stat: 'Ok',
//   norenordno: '123456789',   // Order number (use for tracking)
//   exchordid: 'NSE_ORDER_ID',
//   ... other fields
// }
```

### Key Points
- ✅ All numeric fields sent as **STRINGS**
- ✅ Price format: e.g., "1500.00" (matches price precision)
- ✅ Exchange symbols must be exact (e.g., "INFY-EQ" not "INFY")
- ✅ Product code is 1 character: C, M, H, B
- ✅ Order status comes back immediately or via WebSocket

---

## 📊 Get Orders Example

### Request
```typescript
const orderBookPayload = {
  uid: 'USER123',
  actid: 'ACCOUNT123'
};

const response = await fetch('https://api.shoonya.com/NorenWClientTP/OrderBook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(orderBookPayload)
});

const data = await response.json();
// {
//   stat: 'Ok',
//   values: [
//     {
//       norenordno: '123456789',
//       exch: 'NSE',
//       tsym: 'INFY-EQ',
//       qty: '1',
//       prc: '1500.00',
//       status: 'New',
//       ...
//     }
//   ]
// }
```

### Order Status Values
- `New` → Still pending
- `Pending` → Waiting to be filled
- `Complete` → Fully filled
- `Rejected` → Order rejected
- `Cancelled` → Order cancelled
- `Filled` → Fully filled

---

## 📍 Get Positions Example

### Request
```typescript
const positionPayload = {
  uid: 'USER123',
  actid: 'ACCOUNT123'
};

const response = await fetch('https://api.shoonya.com/NorenWClientTP/PositionBook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(positionPayload)
});

const data = await response.json();
// {
//   stat: 'Ok',
//   values: [
//     {
//       exch: 'NSE',
//       tsym: 'INFY-EQ',
//       qty: '10',                // Net quantity
//       netavgprc: '1490.50',    // Net average price
//       lp: '1500.00',           // Last traded price
//       urmtom: '94.50',         // Unrealized P&L
//       rpnl: '0',               // Realized P&L
//       ...
//     }
//   ]
// }
```

---

## 🔄 Cancel Order Example

### Request
```typescript
const cancelPayload = {
  uid: 'USER123',
  actid: 'ACCOUNT123',
  orderno: '123456789'        // Order number to cancel
};

const response = await fetch('https://api.shoonya.com/NorenWClientTP/CancelOrder', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cancelPayload)
});

const data = await response.json();
// {
//   stat: 'Ok',
//   message: 'Order cancelled successfully'
// }
```

---

## 🌐 Real-Time Updates (WebSocket)

Shoonya also provides WebSocket for real-time updates:

```typescript
// Connect to WebSocket
const ws = new WebSocket('wss://api.shoonya.com/...');

// Listen for order updates
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.t === 'om') {
    // Order update
    console.log('Order update:', data.status);
  } else if (data.t === 'tf') {
    // Touchline (market data) update
    console.log('Price update:', data.lp);
  }
});
```

---

## 🛠️ Implementation in ShoonyaAdapter_REST.ts

We've created a clean implementation that:

✅ **Pure HTTP Calls**
- Uses native `fetch()` (no npm packages)
- Generic `request<T>()` method for all endpoints
- Automatic error handling

✅ **Session Management**
- Login/logout
- Automatic token refresh before expiry
- Session validation before API calls

✅ **Type Safety**
- Full TypeScript interfaces for all Shoonya API types
- Generic response parsing with `<T>`

✅ **Clean Mapping**
- Generic `OrderRequest` → Shoonya `PlaceOrderPayload`
- Shoonya response → Generic `Order` and `Position`

✅ **Error Handling**
- Validation before API calls
- Detailed error messages
- Console logging for debugging

---

## 🚀 How to Use in Your Code

### 1. Initialize Adapter
```typescript
import { ShoonyaAdapter } from '@/lib/brokers/ShoonyaAdapter_REST';

const adapter = new ShoonyaAdapter({
  userId: process.env.SHOONYA_USER_ID!,
  password: process.env.SHOONYA_PASSWORD!,
  vendorCode: process.env.SHOONYA_VENDOR_CODE!,
  apiKey: process.env.SHOONYA_API_KEY!,
  apiSecret: process.env.SHOONYA_API_SECRET!,
  imei: process.env.SHOONYA_IMEI!,
  factor2: process.env.SHOONYA_OTP, // Optional
});
```

### 2. Authenticate
```typescript
await adapter.authenticate();
// ✅ Session token obtained and stored
// 🔄 Auto-refresh setup for token expiry
```

### 3. Place Orders
```typescript
const order = await adapter.placeOrder({
  symbol: 'INFY-EQ',
  exchange: 'NSE',
  side: 'BUY',
  quantity: 1,
  orderType: 'LIMIT',
  price: 1500,
  product: 'CNC',
});
```

### 4. Get Orders/Positions
```typescript
const orders = await adapter.getOrders();
const positions = await adapter.getPositions();
```

### 5. Exit Position
```typescript
await adapter.cancelOrder(orderId);
// or
await adapter.exitAllPositions();
```

### 6. Cleanup
```typescript
await adapter.disconnect();
```

---

## 📝 Environment Variables

```env
# Shoonya API Credentials
SHOONYA_USER_ID=your_user_id
SHOONYA_PASSWORD=your_password
SHOONYA_VENDOR_CODE=vendor_code
SHOONYA_API_KEY=api_key
SHOONYA_API_SECRET=api_secret
SHOONYA_IMEI=123456789012345
SHOONYA_OTP=optional_otp

# Optional: Custom API URL (for testing/staging)
SHOONYA_API_URL=https://api.shoonya.com/NorenWClientTP
```

---

## 🔍 Debugging

### Check Session Status
```typescript
console.log(adapter.getSessionInfo());
console.log(adapter.isAuthenticated());
```

### Enable Logging
```typescript
// ShoonyaAdapter_REST.ts has console.log() for all major operations:
// 🔐 Authenticating
// ✅ Login successful
// 🔄 Session token expiring soon
// 📤 Placing order
// ✅ Order placed successfully
// 📋 Fetching order book
// 📊 Fetching positions
// 👋 Logging out
```

---

## 📚 Reference

- **Official Docs**: https://shoonya.com/api-documentation
- **GitHub Examples**: https://github.com/Shoonya-Dev/ShoonyaApi-js
- **Symbol Master**: Download symbol files from API docs for exact trading symbols

---

## ✨ Key Differences from v1

| Aspect | v1 (Old) | v2 (New) |
|--------|----------|---------|
| API Calls | Mock only | Real REST API calls |
| Dependencies | Referenced npm package | Pure fetch() |
| Session | No management | Full lifecycle + auto-refresh |
| IMEI | Hardcoded 'abc1234' | Validated (15 digits) |
| Field Names | Wrong (price_type) | Correct (prctyp) |
| Type Safety | Loose | Full TypeScript interfaces |
| Error Handling | Generic messages | Detailed context |
| Token Management | None | Stored + refreshed |

---

## 🎯 Next Steps

1. ✅ Update BrokerFactory to use ShoonyaAdapter_REST
2. ⏳ Add unit tests for all API calls
3. ⏳ Test with real Shoonya account
4. ⏳ Handle WebSocket for real-time updates
5. ⏳ Add rate limiting/retry logic

---

**Status**: ✅ Ready for integration
**Last Updated**: 2026-02-24
