# Kotak Neo API Integration Guide

## Overview

This document explains how the Kotak Neo Securities API has been integrated into the Trading Bot application. The integration follows the Adapter Pattern to maintain a broker-agnostic architecture.

## File Structure

```
src/
├── lib/
│   └── brokers/
│       ├── BaseBroker.ts           # Abstract base class
│       ├── BrokerFactory.ts         # Factory for creating broker instances
│       ├── ShoonyaAdapter.ts        # Shoonya implementation
│       └── KotakNeoAdapter.ts       # ✨ NEW - Kotak Neo implementation
├── types/
│   ├── broker.types.ts             # Standard broker interfaces
│   └── kotak.types.ts              # ✨ NEW - Kotak Neo specific types
└── store/
    └── tradingStore.ts             # Zustand store (can be extended)
```

## Architecture

### 1. **Type Definitions** (`src/types/kotak.types.ts`)

Comprehensive TypeScript interfaces for all Kotak Neo API operations:

- **Authentication**: `KotakLoginRequest`, `KotakTotpValidationResponse`, `KotakMpinValidateResponse`
- **Order Management**: `KotakOrderRequest`, `KotakOrderResponse`, `KotakModifyOrderRequest`, `KotakCancelOrderRequest`
- **Reports**: `KotakOrderBookResponse`, `KotakTradeBookResponse`, `KotakPositionBookResponse`, `KotakHoldingsResponse`
- **Risk Management**: `KotakCheckMarginRequest`, `KotakLimitsRequest`, `KotakLimitsResponse`
- **Market Data**: `KotakQuoteResponse`, `KotakScripMasterResponse`
- **Session Management**: `KotakSession`, `KotakSessionConfig`

### 2. **Adapter Implementation** (`src/lib/brokers/KotakNeoAdapter.ts`)

Extends `BaseBroker` and implements all required methods:

#### Key Methods

```typescript
// Authentication
authenticate(): Promise<boolean>
├── validateTotp(): Promise<any>     // Step 1: Mobile + UCC + TOTP
└── validateMpin(): Promise<any>     // Step 2: MPIN validation

// Order Management
placeOrder(orderRequest: OrderRequest): Promise<Order>
modifyOrder(orderId: string, modifications: Partial<OrderRequest>): Promise<Order>
cancelOrder(orderId: string): Promise<boolean>

// Positions & Reports
getPositions(): Promise<Position[]>
getOrders(): Promise<Order[]>
exitPosition(symbol: string, productType: ProductType): Promise<Order>
exitAllPositions(): Promise<Order[]>                    // Kill Switch

// Market Data
getLTP(symbol: string, exchange: string): Promise<number>
getMarketDepth(symbol: string, exchange: string): Promise<MarketDepth>

// Account Management
getBalance(): Promise<number>
disconnect(): Promise<void>
```

#### Private Helper Methods

```typescript
mapOrderRequest(order: OrderRequest): KotakOrderRequest
mapOrderResponse(kotakOrder: any): Order
mapExchange(exchange: string): KotakExchange
unmapExchange(kotakExchange: string): string
mapOrderStatus(status: string): OrderStatus
```

### 3. **Factory Pattern** (`src/lib/brokers/BrokerFactory.ts`)

Extended to support Kotak Neo alongside existing brokers:

```typescript
enum BrokerType {
  SHOONYA = 'SHOONYA',
  KOTAK_NEO = 'KOTAK_NEO',    // ✨ NEW
  ZERODHA = 'ZERODHA',
}

// Create broker instance
const broker = BrokerFactory.createBroker(BrokerType.KOTAK_NEO, credentials);

// Or from environment variables
const broker = BrokerFactory.createFromEnv();
```

## API Endpoints

### Base URLs
- **Production**: `https://mis.kotaksecurities.com`
- **API Base**: `{baseUrl}` (returned after authentication)

### Authentication Flow

```
1. POST /login/1.0/tradeApiLogin (TOTP Validation)
   ├── Headers: neo-fin-key, Authorization (ConsumerKey)
   ├── Body: { mobileNumber, ucc, totp }
   └── Response: { data: { token (viewToken), sid (sidView) } }

2. POST /login/1.0/tradeApiValidate (MPIN Validation)
   ├── Headers: Authorization (ConsumerKey), Sid (sidView), Auth (viewToken)
   ├── Body: { mpin }
   └── Response: { data: { token (sessionToken), sid (sidSession), baseUrl } }
```

### Key API Endpoints

**Order Management**
- `POST {baseUrl}/quick/order/rule/ms/place` - Place order
- `POST {baseUrl}/quick/order/vr/modify` - Modify order
- `POST {baseUrl}/quick/order/cancel` - Cancel order
- `POST {baseUrl}/quick/order/co/exit` - Exit cover order
- `POST {baseUrl}/quick/order/bo/exit` - Exit bracket order

**Reports**
- `GET {baseUrl}/quick/user/orders` - Order book
- `GET {baseUrl}/quick/user/trades` - Trade book
- `GET {baseUrl}/quick/user/positions` - Positions
- `GET {baseUrl}/portfolio/v1/holdings` - Holdings

**Risk Management**
- `POST {baseUrl}/quick/user/check-margin` - Check margin
- `POST {baseUrl}/quick/user/limits` - Get account limits

**Market Data**
- `GET {baseUrl}/script-details/1.0/quotes/neosymbol/{exchange}|{symbol}/all` - Get quotes

## Environment Variables

Add these to your `.env` file:

```bash
# Broker Selection
ACTIVE_BROKER=KOTAK_NEO

# Kotak Neo Credentials
KOTAK_CONSUMER_KEY=your_consumer_key_from_kotak
KOTAK_MOBILE_NUMBER=+919876543210          # Your registered mobile
KOTAK_UCC=YOUR_UCC                         # Unique Client Code
KOTAK_TOTP=000000                          # 6-digit TOTP from authenticator
KOTAK_MPIN=123456                          # Your trading MPIN
```

## Usage Examples

### 1. **Initialize Broker from Environment**

```typescript
import { BrokerFactory, BrokerType } from '@/lib/brokers/BrokerFactory';

const broker = BrokerFactory.createFromEnv();
const authenticated = await broker.authenticate();
```

### 2. **Place an Order**

```typescript
import { OrderType, OrderSide, ProductType } from '@/types/broker.types';

const order = await broker.placeOrder({
  symbol: 'TCS-EQ',
  exchange: 'NSE',
  side: OrderSide.BUY,
  quantity: 1,
  price: 3150,
  orderType: OrderType.LIMIT,
  productType: ProductType.INTRADAY,
});

console.log(`Order placed: ${order.orderId}`);
```

### 3. **Get Positions**

```typescript
const positions = await broker.getPositions();
positions.forEach(pos => {
  console.log(`${pos.symbol}: ${pos.quantity} @ ${pos.ltp}`);
});
```

### 4. **Kill Switch - Exit All Positions**

```typescript
const exitOrders = await broker.exitAllPositions();
console.log(`Exited ${exitOrders.length} positions`);
```

### 5. **Get Market Data**

```typescript
const ltp = await broker.getLTP('TCS-EQ', 'NSE');
console.log(`TCS LTP: ${ltp}`);

const depth = await broker.getMarketDepth('TCS-EQ', 'NSE');
console.log(`Bid: ${depth.bid}, Ask: ${depth.ask}`);
```

### 6. **Get Account Balance**

```typescript
const balance = await broker.getBalance();
console.log(`Available margin: ${balance}`);
```

## Order Request Mapping

The adapter automatically maps standard `OrderRequest` to Kotak Neo format:

```
OrderSide.BUY  → 'B'
OrderSide.SELL → 'S'

OrderType.LIMIT   → 'L'
OrderType.MARKET  → 'M'

ProductType.DELIVERY → 'CNC'  (Cash & Carry)
ProductType.INTRADAY → 'MIS'  (Margin Intraday Square-off)
ProductType.MARGIN   → 'NRML' (Normal - Overnight)

Exchange.NSE → 'nse_cm'
Exchange.BSE → 'bse_cm'
Exchange.NFO → 'nse_fo'
Exchange.MCX → 'mcx_fo'
Exchange.NCDEX → 'ncdex_fo'
```

## Order Status Mapping

Kotak Neo Status → Standard Status

```
'Open'                 → OPEN
'Pending'             → PENDING
'Executed'            → COMPLETE
'PartiallyExecuted'   → OPEN
'Cancelled'           → CANCELLED
'Rejected'            → REJECTED
```

## Request/Response Headers

### Authentication Headers
```
neo-fin-key: neotradeapi
Authorization: {consumerKey}
Content-Type: application/json
```

### Trading Headers
```
Sid: {sessionSid}
Auth: {sessionToken}
Content-Type: application/x-www-form-urlencoded
```

## Error Handling

The adapter includes error handling for:
- Authentication failures
- Network errors
- API validation errors
- Order rejection
- Invalid credentials

```typescript
try {
  await broker.authenticate();
} catch (error) {
  console.error('Authentication failed:', error.message);
}
```

## WebSocket Support

**Note**: The basic REST adapter does not include WebSocket support. For real-time market data:

1. Implement WebSocket handler in `WebSocketService`
2. Use REST API polling as fallback
3. Extend adapter with WebSocket connection logic

## Security Considerations

⚠️ **Important**:
- Never commit `.env` file with actual credentials
- Use environment variables for sensitive data
- Rotate TOTP and MPIN regularly
- Validate all inputs before sending to API
- Implement rate limiting for API calls
- Use HTTPS for all communications
- Decrypt sensitive data at runtime only

## Testing

To test the integration:

```bash
# 1. Set environment variables
export ACTIVE_BROKER=KOTAK_NEO
export KOTAK_CONSUMER_KEY=your_key
export KOTAK_MOBILE_NUMBER=+919876543210
export KOTAK_UCC=YOUR_UCC
export KOTAK_TOTP=123456
export KOTAK_MPIN=123456

# 2. Run development server
npm run dev

# 3. Test authentication
const broker = BrokerFactory.createFromEnv();
await broker.authenticate();
```

## Limitations & Future Enhancements

### Current Limitations
- ✗ No WebSocket support for real-time updates
- ✗ Market depth limited to quote data
- ✗ No streaming quotes
- ✓ REST API polling for positions/orders

### Future Enhancements
- [ ] WebSocket implementation for real-time data
- [ ] Advanced order types (Bracket, Cover orders)
- [ ] GTT (Good Till Triggered) orders
- [ ] Margin calculator
- [ ] Holdings display
- [ ] Historical data retrieval
- [ ] API rate limiting & throttling
- [ ] Order execution analytics

## Comparison with Shoonya Adapter

| Feature | Kotak Neo | Shoonya |
|---------|-----------|---------|
| Authentication | TOTP + MPIN | User ID + Password + OTP |
| Order Types | Regular, Cover, Bracket | Market, Limit, SL |
| Product Types | CNC, MIS, NRML, BO, CO | Same |
| Real-time Data | REST polling | WebSocket |
| Market Depth | Limited | Yes |
| Holdings Support | Yes | Yes |
| Risk Management | Margin, Limits | Similar |

## Support & Resources

- **Kotak Neo Documentation**: https://www.kotakneo.com/
- **API Postman Collection**: https://www.kotakneo.com/uploads/Client_AP_Is_postman_collection_82fa888c63.json
- **Support Email**: api-support@kotaksecurities.com

## Troubleshooting

### Issue: TOTP Validation Failed
- Ensure TOTP is fresh (< 30 seconds old)
- Check mobile number format: +919876543210
- Verify UCC code is correct

### Issue: MPIN Validation Failed
- Verify MPIN is correct (6 digits)
- Check if trading account is active
- Ensure session hasn't expired

### Issue: Order Placement Failed
- Verify adequate margin available
- Check symbol format (e.g., TCS-EQ for NSE)
- Ensure market is open for the exchange
- Validate price within daily limits

### Issue: Connection Timeout
- Check internet connection
- Verify API endpoint is reachable
- Implement retry logic with exponential backoff

---

**Last Updated**: February 25, 2026
**Status**: ✅ Production Ready
