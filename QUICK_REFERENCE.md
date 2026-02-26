# 🚀 Quick Reference Guide

## 📚 Documentation Map

Start here based on your role:

### 👨‍💼 Project Managers / Decision Makers
1. Read: `EXECUTIVE_SUMMARY.md` (10 min)
   - Problem, solution, timeline, cost-benefit
2. Review: `IMPLEMENTATION_TIMELINE.md` (5 min)
   - 15-day rollout plan
3. Check: `REFACTORING_CHECKLIST.md` (5 min)
   - Success criteria & risk assessment

**Total Time**: ~20 minutes

### 👨‍💻 Developers
1. Read: `ANALYSIS_ISSUES.md` (15 min)
   - Understand what was wrong
2. Review: `COMPARISON_v1_vs_v2.md` (15 min)
   - See before/after code
3. Study: `ShoonyaAdapter_v2.ts` (30 min)
   - New implementation
4. Follow: `MIGRATION_GUIDE_v2.md` (15 min)
   - Integration steps

**Total Time**: ~75 minutes

### 🧪 QA / Testers
1. Read: `REFACTORING_CHECKLIST.md` (20 min)
   - Complete testing checklist
2. Review: `COMPARISON_v1_vs_v2.md` (10 min)
   - Key differences to test
3. Check: `IMPLEMENTATION_TIMELINE.md` (5 min)
   - Testing schedule

**Total Time**: ~35 minutes

### 🔧 DevOps / Deployment
1. Read: `IMPLEMENTATION_TIMELINE.md` (15 min)
   - Deployment plan
2. Review: `MIGRATION_GUIDE_v2.md` (10 min)
   - Environment setup
3. Check: `EXECUTIVE_SUMMARY.md` (5 min)
   - Rollback procedures

**Total Time**: ~30 minutes

---

## 📊 Issue Reference

### Critical Issues (5)
```
❌ v1: Mock API calls always return fake data
✅ v2: Real API calls to Shoonya

❌ v1: No session token storage
✅ v2: Session persisted with expiry tracking

❌ v1: Hardcoded IMEI 'abc1234'
✅ v2: Validated IMEI (15 digits required)

❌ v1: Wrong field names (price_type, pwd)
✅ v2: Correct API field names (pricetype, pwd)

❌ v1: No error details or validation
✅ v2: Pre-flight validation + detailed errors
```

### High-Severity Issues (12)
- Type conversions (string ↔ number)
- Missing exchange tokens
- No order status mapping
- No credential validation
- Wrong password field usage
- Missing API endpoints
- No session refresh
- Missing order response fields

### Medium-Severity Issues (10)
- Hardcoded retention field
- Hardcoded remarks
- Generic error handling
- Missing response validation
- Type safety issues

### Low-Severity Issues (4)
- Code documentation
- Performance optimization
- Logging improvements
- Constants extraction

---

## 🔑 Key Concepts

### Session Management (NEW in v2)

**Before (v1)**:
```typescript
// ❌ No session - never stored
if (loginResponse.stat === 'Ok') {
  this.isAuthenticated = true;  // Only this boolean!
}
```

**After (v2)**:
```typescript
// ✅ Complete session data
this.sessionData = {
  token: response.susertoken,        // For API calls
  loginid: response.loginid,         // User ID
  userToken: response.susertoken,    // Alternative token
  products: response.prarr || [],    // Available products
  expiresAt: new Date(...)           // Expiry tracking
};

// ✅ Auto-refresh before expiry
this.setupSessionRefresh();
```

### Order Validation (NEW in v2)

**Before (v1)**:
```typescript
// ❌ No validation - just place order
async placeOrder(orderRequest) {
  // Blindly sends to API
}
```

**After (v2)**:
```typescript
// ✅ Pre-flight validation
private validateOrder(order: ShoonyaOrderRequest) {
  if (order.quantity <= 0) throw new Error('...');
  if (order.quantity > 1000000) throw new Error('...');
  if (order.price < 0) throw new Error('...');
  if (order.pricetype === 'LMT' && order.price === 0) {
    throw new Error('...');
  }
}
```

### Type Safety (NEW in v2)

**Before (v1)**:
```typescript
// ❌ No type definitions
private async shoonyaLogin(): Promise<any> {
  // What's the response format? Nobody knows!
}
```

**After (v2)**:
```typescript
// ✅ Complete type definitions
import { 
  ShoonyaLoginRequest,
  ShoonyaLoginResponse,
  ShoonyaSessionData,
  ShoonyaOrderRequest,
  ShoonyaOrderResponse
} from '@/types/shoonya.types';

private async shoonyaLogin(): Promise<ShoonyaLoginResponse> {
  // Clear request/response types
}
```

---

## 🛠️ Quick Setup

### 1. Add Environment Variables

```env
# New required variables
SHOONYA_PASSWORD=your_actual_password    # NOT API secret!
SHOONYA_IMEI=123456789012345             # 15 digits required
SHOONYA_FACTOR2=123456                   # If 2FA enabled (optional)
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Test Authentication

```typescript
const adapter = new ShoonyaAdapter({
  userId: 'your_user_id',
  password: 'your_password',      // Real password!
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret',
  vendorCode: 'your_vendor_code',
  imei: '123456789012345'          // 15 digits
});

const success = await adapter.authenticate();
console.log(success ? '✅ Connected' : '❌ Failed');
```

### 4. Place a Test Order

```typescript
const order = await adapter.placeOrder({
  symbol: 'SBIN-EQ',
  exchange: 'NSE',
  side: 'BUY',
  quantity: 1,
  orderType: 'LIMIT',
  price: 500.50,
  productType: 'INTRADAY'
});

console.log('Order ID:', order.orderId);
```

---

## 📋 Testing Checklist

### Quick Test (5 minutes)
- [ ] Authentication works
- [ ] Can fetch orders
- [ ] Can fetch positions
- [ ] Error messages are clear

### Full Test (30 minutes)
- [ ] Place limit order
- [ ] Place market order
- [ ] Cancel order
- [ ] Check order book
- [ ] Check position book
- [ ] Session refresh works
- [ ] Error handling works

### Complete Test (2 hours)
- [ ] All above + more
- [ ] Load testing
- [ ] Stress testing
- [ ] Performance testing
- [ ] Security testing

---

## 🐛 Common Issues & Fixes

### Issue: "Invalid IMEI format"
```
Problem: IMEI must be exactly 15 digits
Fix:     Update SHOONYA_IMEI to valid 15-digit number
         Example: 123456789012345
```

### Issue: "Missing required credentials"
```
Problem: One or more credentials are missing
Fix:     Check .env.local has all required fields:
         - SHOONYA_USER_ID
         - SHOONYA_PASSWORD (not API secret!)
         - SHOONYA_IMEI
         - SHOONYA_API_KEY
         - SHOONYA_VENDOR_CODE
```

### Issue: "Order placement failed: Order status invalid"
```
Problem: Order validation failed
Fix:     Check:
         - Quantity > 0
         - Price >= 0 (for limit orders)
         - Trigger price set (for SL orders)
```

### Issue: "Session expired"
```
Problem: Session tokens are old
Fix:     System should auto-refresh
         Check sessionRefreshInterval is running
         Verify network connectivity
```

---

## 📈 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Auth Time | < 500ms | Testing |
| Order Placement | < 1s | Testing |
| Get Orders | < 500ms | Testing |
| Get Positions | < 500ms | Testing |
| Session Refresh | 24h | Implemented |
| Type Safety | 100% | 100% ✅ |
| Test Coverage | > 80% | Testing |

---

## 🚀 Deployment Checklist

Before going live:

- [ ] All tests passing
- [ ] No critical bugs
- [ ] Documentation complete
- [ ] Team trained
- [ ] Rollback plan ready
- [ ] Monitoring setup
- [ ] Alerts configured
- [ ] On-call schedule
- [ ] Communication plan

---

## 📞 Support Contacts

### Questions About Code?
- Check `ANALYSIS_ISSUES.md` for what was wrong
- Check `COMPARISON_v1_vs_v2.md` for code changes
- Check code comments in `ShoonyaAdapter_v2.ts`

### Questions About Migration?
- Follow `MIGRATION_GUIDE_v2.md`
- Check environment variables in `.env.example`

### Questions About Testing?
- Follow `REFACTORING_CHECKLIST.md`
- Check `IMPLEMENTATION_TIMELINE.md`

### Questions About Deployment?
- Check `IMPLEMENTATION_TIMELINE.md`
- Check `EXECUTIVE_SUMMARY.md` rollback section

---

## 📞 Emergency Contacts

If production issue:
1. Check error messages
2. Review monitoring dashboards
3. Check `IMPLEMENTATION_TIMELINE.md` (Rollback section)
4. Execute rollback if needed
5. Document what happened

---

## ✅ Done Checklist

- [x] Analyzed 31 issues in v1
- [x] Created complete v2 implementation
- [x] Added Shoonya type definitions
- [x] Wrote 6 documentation files
- [x] Created migration guide
- [x] Created testing checklist
- [x] Created timeline
- [x] Created executive summary

**Status**: 🟢 **Ready for Testing Phase**

---

**Last Updated**: 2026-02-24  
**Next**: Start unit tests (Day 3)
