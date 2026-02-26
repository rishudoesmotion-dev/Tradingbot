# Kotak Neo API - Quick Start Guide

## 1️⃣ Setup Environment Variables

```bash
# In your .env file:
ACTIVE_BROKER=KOTAK_NEO
KOTAK_CONSUMER_KEY=your_consumer_key_here
KOTAK_MOBILE_NUMBER=+919876543210
KOTAK_UCC=YOUR_UCC_CODE
KOTAK_TOTP=123456      # 6-digit code from authenticator app
KOTAK_MPIN=123456      # Your trading MPIN
```

## 2️⃣ Initialize Broker

```typescript
import { BrokerFactory } from '@/lib/brokers/BrokerFactory';

// Option A: From environment variables
const broker = BrokerFactory.createFromEnv();

// Option B: Manually (for testing)
import { BrokerType } from '@/lib/brokers/BrokerFactory';
import { BrokerCredentials } from '@/types/broker.types';

const credentials: BrokerCredentials = {
  userId: 'YOUR_UCC',
  apiKey: 'YOUR_CONSUMER_KEY',
  apiSecret: JSON.stringify({
    mobileNumber: '+919876543210',
    ucc: 'YOUR_UCC',
    totp: '123456',
    mpin: '123456',
  }),
};

const broker = BrokerFactory.createBroker(BrokerType.KOTAK_NEO, credentials);
```

## 3️⃣ Authenticate

```typescript
try {
  const authenticated = await broker.authenticate();
  if (authenticated) {
    console.log('✅ Connected to Kotak Neo');
  }
} catch (error) {
  console.error('❌ Authentication failed:', error.message);
}
```

## 4️⃣ Common Operations

### Place Order
```typescript
import { OrderType, OrderSide, ProductType } from '@/types/broker.types';

const order = await broker.placeOrder({
  symbol: 'TCS-EQ',           // NSE: Symbol-EQ, NFO: Symbol-XX
  exchange: 'NSE',            // NSE, BSE, NFO, MCX, NCDEX
  side: OrderSide.BUY,        // BUY or SELL
  quantity: 1,
  price: 3150,                // 0 for market orders
  orderType: OrderType.LIMIT, // LIMIT or MARKET
  productType: ProductType.INTRADAY, // INTRADAY, DELIVERY, MARGIN
});

console.log(`Order ${order.orderId} placed successfully`);
```

### Cancel Order
```typescript
const cancelled = await broker.cancelOrder('ORDER_ID');
console.log(cancelled ? '✅ Order cancelled' : '❌ Failed to cancel');
```

### Modify Order
```typescript
const modified = await broker.modifyOrder('ORDER_ID', {
  quantity: 2,
  price: 3200,
  productType: ProductType.INTRADAY,
});
```

### Get Positions
```typescript
const positions = await broker.getPositions();
positions.forEach(pos => {
  console.log(`
    Symbol: ${pos.symbol}
    Qty: ${pos.quantity}
    LTP: ${pos.ltp}
    P&L: ${pos.pnl} (${pos.pnlPercentage}%)
  `);
});
```

### Exit Position
```typescript
// Exit single position
const exitOrder = await broker.exitPosition('TCS-EQ', ProductType.INTRADAY);

// Exit ALL positions (Kill Switch)
const allExits = await broker.exitAllPositions();
console.log(`Exited ${allExits.length} positions`);
```

### Get Orders
```typescript
const orders = await broker.getOrders();
orders.forEach(order => {
  console.log(`
    Order: ${order.orderId}
    ${order.symbol} ${order.side} ${order.quantity}@${order.price}
    Status: ${order.status}
  `);
});
```

### Get LTP
```typescript
const ltp = await broker.getLTP('TCS-EQ', 'NSE');
console.log(`TCS LTP: ₹${ltp}`);
```

### Get Balance
```typescript
const balance = await broker.getBalance();
console.log(`Available Margin: ₹${balance}`);
```

### Disconnect
```typescript
await broker.disconnect();
console.log('✅ Disconnected');
```

## 5️⃣ Supported Exchanges

| Code | Name | Example Symbol |
|------|------|-----------------|
| NSE | National Stock Exchange | TCS-EQ |
| BSE | Bombay Stock Exchange | SENSEX-IDX |
| NFO | NSE Futures & Options | TCS-XX |
| MCX | Multi Commodity Exchange | GOLD-XX |
| NCDEX | National Commodity Derivatives | CPR-XX |

## 6️⃣ Supported Product Types

| Type | Code | Description |
|------|------|-------------|
| DELIVERY | CNC | Cash & Carry (Overnight) |
| INTRADAY | MIS | Margin Intraday Square-off |
| MARGIN | NRML | Normal (Overnight with margin) |

## 7️⃣ Order Status Values

```typescript
PENDING  → Order placed, awaiting execution
OPEN     → Order partially executed
COMPLETE → Order fully executed
REJECTED → Order rejected by exchange
CANCELLED → Order cancelled by user
```

## 8️⃣ Symbol Formats

### NSE Equities
- `TCS-EQ` (Equity)
- `RELIANCE-EQ`
- `INFY-EQ`

### NSE Derivatives
- `TCS-27-FEB-24-CE-3200` (Call Option)
- `NIFTY-27-FEB-24-PE-23500` (Put Option)
- `TCS-27-FEB-24-FUT` (Futures)

### Indices
- `NIFTY-50-IDX`
- `SENSEX-IDX`

## 9️⃣ Error Handling

```typescript
try {
  await broker.placeOrder(orderRequest);
} catch (error) {
  if (error.message.includes('Not authenticated')) {
    console.error('⚠️  Please authenticate first');
  } else if (error.message.includes('inadequate margin')) {
    console.error('⚠️  Insufficient margin');
  } else if (error.message.includes('invalid symbol')) {
    console.error('⚠️  Symbol not found');
  } else {
    console.error('❌ Error:', error.message);
  }
}
```

## 🔟 Integration with Trading Store

```typescript
import { useTradingStore } from '@/store/tradingStore';

const store = useTradingStore();

// Connect to broker
store.setBroker(broker);
await store.connect();

// Place order through store
await store.placeOrder({
  symbol: 'TCS-EQ',
  side: 'BUY',
  quantity: 1,
  price: 3150,
  // ... other fields
});

// Get data from store
const { positions, orders, balance } = store.getState();
```

## ⚠️ Important Notes

1. **TOTP Expiration**: TOTP codes expire every 30 seconds. Generate fresh code before authentication.
2. **Market Hours**: Orders can only be placed during market hours.
3. **Symbol Format**: Always include exchange code (e.g., `TCS-EQ` for NSE equity).
4. **Margin**: Check available margin before placing orders.
5. **Kill Switch**: Use `exitAllPositions()` for emergency exits.
6. **Disconnection**: Always call `disconnect()` when done.

## 📚 Full Documentation

See `KOTAK_NEO_INTEGRATION.md` for:
- Complete API reference
- Architecture details
- Advanced configurations
- Troubleshooting guide
- Security best practices

## 🎯 Next Steps

1. Set up environment variables with your Kotak Neo credentials
2. Test authentication
3. Start placing paper trades
4. Monitor positions in real-time
5. Implement risk management rules
6. Monitor trading performance

---

**Pro Tips** 💡:
- Use `MARKET` order type for quick execution
- Check margin before placing orders
- Use `INTRADAY` product for day trades
- Test with small quantities first
- Monitor all positions regularly
- Set stop losses to limit risk
