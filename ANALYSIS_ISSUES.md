<!-- ANALYSIS: Issues Found in Shoonya API Implementation -->

# 🚨 Issues Found in Shoonya API Implementation

## Critical Issues Identified

### 1. **Hardcoded & Mock Values** ❌

#### Issue 1.1: Mock Login Payload
```typescript
// ❌ WRONG - Hardcoded values
const loginPayload = {
  apkversion: 'js:1.0.0',        // Should come from config
  uid: this.credentials.userId,
  pwd: this.credentials.apiSecret,
  factor2: 'second_factor',      // Hardcoded! Should be optional/configurable
  vc: this.credentials.vendorCode,
  appkey: this.credentials.apiKey,
  imei: this.credentials['imei'] || 'abc1234'  // 'abc1234' is invalid IMEI
};
```

**Problems**:
- `apkversion` should not be hardcoded
- `factor2` (TOTP) is hardcoded but may not be required
- IMEI fallback 'abc1234' is invalid - real IMEI needed
- `pwd` should not be API secret (usually needs different format)

#### Issue 1.2: Hardcoded Order Fields
```typescript
// ❌ WRONG - Hardcoded retention and remarks
const shoonyaOrder = {
  // ... other fields ...
  retention: 'DAY',              // Always hardcoded!
  remarks: 'TradingTerminal'     // Hardcoded!
};
```

**Problems**:
- `retention` should be configurable (DAY, IOC, GTT, etc.)
- `remarks` is optional, shouldn't be forced

#### Issue 1.3: Mock Response
```typescript
// ❌ WRONG - Always returns mock data
const response = {
  stat: 'Ok',
  norenordno: `${Date.now()}`    // Fake order ID!
};
```

**Problems**:
- Never actually calls real API
- Fake order IDs break real trading
- Returns success even if auth failed

### 2. **Incorrect Field Mappings** ❌

#### Issue 2.1: Order Type Mapping
```typescript
// ❌ Wrong mapping
price_type: this.mapOrderType(orderRequest.orderType),
```

Shoonya API uses different field names:
- Should be `pricetype` not `price_type`
- Values: `LMT` (Limit), `MKT` (Market), `SL-LMT`, `SL-MKT`

#### Issue 2.2: Missing Required Fields
```typescript
// ❌ Missing fields
const shoonyaOrder = {
  // Missing: loginid, token (session)
  // Missing: ordersource
  // Missing: modity (modify flag)
  // Missing: exch_tsym (exchange token)
};
```

**Required fields missing**:
- `loginid` - User session ID
- `token` - Session token from login
- `exch_tsym` - Exchange traded symbol (different from tradingsymbol)
- `orderid` - For modify/cancel operations

### 3. **Incorrect Parameter Types** ❌

```typescript
// ❌ Strings where numbers expected
quantity: orderRequest.quantity.toString(),  // Should be number
price: orderRequest.price?.toString() || '0', // Should be number
trigger_price: orderRequest.triggerPrice?.toString() || '0' // Should be number

// ❌ Wrong boolean conversion
discloseqty: orderRequest.disclosedQuantity?.toString() || '0'  // Should handle missing
```

### 4. **Session Management Issues** ❌

```typescript
// ❌ No session token stored
private async shoonyaLogin(): Promise<any> {
  const loginResponse = await this.shoonyaLogin();
  // loginResponse contains 'susertoken' and 'loginid'
  // But these are NEVER stored!
  // All subsequent API calls will fail without these
}
```

**Problems**:
- Session tokens not persisted
- No session expiry handling
- Re-authentication not implemented

### 5. **API Endpoint Issues** ❌

```typescript
// ❌ Missing actual API implementation
// const response = await this.shoonyaClient.placeOrder(shoonyaOrder);
// const response = await this.shoonyaClient.getOrderBook();
// const response = await this.shoonyaClient.getPositionBook();

// All commented out! No real API calls!
```

### 6. **Error Handling** ❌

```typescript
// ❌ Generic error handling
try {
  // ...
} catch (error) {
  console.error('Order placement failed:', error);  // Just logs, returns mock
  throw error;
}
```

**Problems**:
- Doesn't distinguish between auth, network, validation errors
- No retry logic
- No rate limiting handling

### 7. **Type Conversion Issues** ❌

```typescript
// ❌ Product type mapping unclear
private mapProductType(productType: ProductType): string {
  const mapping: Record<ProductType, string> = {
    [ProductType.INTRADAY]: 'I',
    [ProductType.DELIVERY]: 'C',
    [ProductType.MARGIN]: 'M'
  };
  return mapping[productType] || 'I';
}

// Shoonya uses: 'I' (Intraday), 'C' (Carry forward/Delivery), 'M' (Margin)
// But no validation of values from API docs
```

### 8. **Missing Order Status Mapping** ❌

```typescript
// ❌ Status not mapped from Shoonya response
private mapToOrder(response: any, request: OrderRequest): Order {
  return {
    orderId: response.norenordno || response.orderId || '',
    // ...
    status: OrderStatus.PENDING,  // ❌ Always PENDING!
    // Should map from response.status
  };
}
```

Shoonya returns statuses like:
- `"Pending"` → `PENDING`
- `"Complete"` → `COMPLETE`
- `"Rejected"` → `REJECTED`
- `"Cancelled"` → `CANCELLED`

### 9. **Missing API Response Validation** ❌

```typescript
// ❌ No validation of response format
if (loginResponse && loginResponse.stat === 'Ok') {
  this.isAuthenticated = true;
  // But loginResponse might not have 'susertoken'!
  // Should extract and store token
}
```

### 10. **Exchange Symbol Issues** ❌

```typescript
// ❌ Only using trading symbol
tradingsymbol: orderRequest.symbol,
// Missing: exch_tsym (exchange trading symbol)

// Shoonya needs BOTH:
// - tradingsymbol: "RELIANCE-EQ" (NSE symbol)
// - exch_tsym: "1333:NSE" (exchange token format)
```

---

## Summary of Required Fixes

| Issue | Severity | Fix |
|-------|----------|-----|
| Mock API calls | **CRITICAL** | Implement actual API endpoints |
| No session storage | **CRITICAL** | Store loginid & token from login |
| Hardcoded IMEI | **HIGH** | Make configurable |
| Wrong field names | **HIGH** | Use correct API field names |
| String vs Number | **HIGH** | Fix type conversions |
| No order status mapping | **MEDIUM** | Map Shoonya statuses |
| Missing exchange token | **HIGH** | Add exch_tsym parameter |
| Hardcoded retention | **MEDIUM** | Make configurable |

---

## Correct Shoonya API Format

### Login Request
```json
{
  "uid": "USERNAME",
  "pwd": "PASSWORD",
  "factor2": "TOTP_VALUE",
  "vc": "VENDOR_CODE",
  "appkey": "API_KEY",
  "imei": "VALID_IMEI"
}
```

### Login Response
```json
{
  "stat": "Ok",
  "susertoken": "SESSION_TOKEN",
  "loginid": "USER_ID",
  "email": "user@example.com",
  "actid": "ACCOUNT_ID"
}
```

### Order Placement Request
```json
{
  "loginid": "USER_ID",
  "token": "SESSION_TOKEN",
  "buy_or_sell": "B",
  "ordersource": "API",
  "tradingsymbol": "SBIN-EQ",
  "exch_tsym": "1333:NSE",
  "exchange": "NSE",
  "quantity": 1,
  "disclosedqty": 0,
  "price": 500.50,
  "trigger_price": 0,
  "pricetype": "LMT",
  "product_type": "I",
  "ordertype": "REGULAR",
  "retention": "DAY"
}
```

### Order Response
```json
{
  "stat": "Ok",
  "norenordno": "ORDER_ID"
}
```

---

This document will be used to refactor the entire ShoonyaAdapter implementation.
