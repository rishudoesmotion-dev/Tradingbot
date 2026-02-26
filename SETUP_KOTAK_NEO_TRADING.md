# Kotak Neo Trading Setup - Step by Step Guide

## 🎯 Objective
Get your Trading Bot connected to Kotak Neo and place your first trade in 15 minutes.

## ✅ Prerequisites Check

Before starting, you need:
- [ ] Kotak Securities trading account (active)
- [ ] Consumer Key (API credentials)
- [ ] Mobile number (registered with account)
- [ ] UCC (User Client Code)
- [ ] TOTP app (Google Authenticator or similar)
- [ ] Trading MPIN (6-digit code)

## 📋 Step 1: Gather Your Kotak Neo Credentials (2 minutes)

### Where to Find Each Credential:

**1. Consumer Key (API Key)**
- Log in to https://www.kotakneo.com/
- Go to Settings → API Credentials
- Copy your Consumer Key
- Example: `abc123xyz789`

**2. Mobile Number**
- The phone number registered with your Kotak Securities account
- Format: `+919876543210` (with +91 country code)
- Example: `+919876543210`

**3. UCC (User Client Code)**
- Found in your Kotak account documentation
- Or visible in trading terminal
- Usually 5-6 alphanumeric characters
- Example: `AB12CD` or `ABC123`

**4. TOTP (One-Time Password)**
- Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator)
- Look for Kotak Neo entry
- Copy the 6-digit code
- ⚠️ Code changes every 30 seconds!

**5. Trading MPIN**
- The 6-digit password you set for trading
- Different from your login password
- Format: 6 digits
- Example: `123456`

## 🔧 Step 2: Update Environment Variables (3 minutes)

Edit your `.env` file and replace the placeholder values:

```bash
# Active Broker
ACTIVE_BROKER=KOTAK_NEO

# Your Kotak Neo Credentials
KOTAK_CONSUMER_KEY=<your_actual_consumer_key_here>
KOTAK_MOBILE_NUMBER=<your_registered_mobile_with_+91>
KOTAK_UCC=<your_UCC_code>
KOTAK_TOTP=<fresh_6_digit_code_from_app>
KOTAK_MPIN=<your_6_digit_trading_mpin>
```

### Example (DO NOT USE - Just for reference):
```bash
KOTAK_CONSUMER_KEY=abc123xyz789def456
KOTAK_MOBILE_NUMBER=+919876543210
KOTAK_UCC=AB12CD
KOTAK_TOTP=654321
KOTAK_MPIN=123456
```

⚠️ **IMPORTANT**: 
- Keep TOTP fresh (generate within 30 seconds)
- Never commit `.env` to git
- Use `.env.local` for local testing

## 🚀 Step 3: Test Authentication (5 minutes)

### Option A: Using Node.js REPL

```bash
# Open terminal in your project directory
cd c:\Users\sachin.gautam\Documents\work\personal\Tradingbot

# Start Node REPL
node

# Run this code:
```

```javascript
// In Node REPL
const { BrokerFactory } = require('./dist/lib/brokers/BrokerFactory');

async function testAuth() {
  try {
    console.log('🔌 Connecting to Kotak Neo...');
    const broker = BrokerFactory.createFromEnv();
    
    const authenticated = await broker.authenticate();
    
    if (authenticated) {
      console.log('✅ SUCCESS! Authenticated with Kotak Neo');
      
      // Get balance
      const balance = await broker.getBalance();
      console.log(`💰 Account Balance: Rs${balance}`);
      
      // Get positions
      const positions = await broker.getPositions();
      console.log(`📊 Open Positions: ${positions.length}`);
      
      await broker.disconnect();
      process.exit(0);
    } else {
      console.log('❌ Authentication failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testAuth();
```

### Option B: Using Your Trading Dashboard

1. Start the development server:
```bash
npm run dev
```

2. Open http://localhost:3000 in your browser

3. Click "Connect" button in ConnectionStatus component

4. You should see:
   - ✅ Connection status changes to "Connected"
   - 💰 Account balance displays
   - 📊 Positions load

## 💹 Step 4: Place Your First Trade (3 minutes)

### Simple Market Order

```typescript
// File: test-trade.ts
import { BrokerFactory } from '@/lib/brokers/BrokerFactory';
import { OrderSide, OrderType, ProductType } from '@/types/broker.types';

async function placeFirstTrade() {
  const broker = BrokerFactory.createFromEnv();
  
  try {
    console.log('🔌 Authenticating...');
    await broker.authenticate();
    console.log('✅ Authenticated');
    
    console.log('💰 Checking balance...');
    const balance = await broker.getBalance();
    console.log(`Account Balance: Rs${balance}`);
    
    if (balance < 5000) {
      console.log('❌ Insufficient balance for trading');
      return;
    }
    
    console.log('📝 Placing BUY order for 1 TCS share...');
    
    const order = await broker.placeOrder({
      symbol: 'TCS-EQ',          // NSE equity symbol
      exchange: 'NSE',           // National Stock Exchange
      side: OrderSide.BUY,       // Buy side
      quantity: 1,               // 1 share
      price: 0,                  // 0 for market order
      orderType: OrderType.MARKET,  // Market order (quick execution)
      productType: ProductType.INTRADAY,  // Intraday (close at end of day)
    });
    
    console.log('✅ Order Placed Successfully!');
    console.log(`Order ID: ${order.orderId}`);
    console.log(`Symbol: ${order.symbol}`);
    console.log(`Quantity: ${order.quantity}`);
    console.log(`Status: ${order.status}`);
    console.log(`Filled: ${order.filledQuantity} shares`);
    console.log(`Avg Price: Rs${order.averagePrice}`);
    
    // Check positions
    console.log('\n📊 Current Positions:');
    const positions = await broker.getPositions();
    positions.forEach(pos => {
      console.log(`${pos.symbol}: ${pos.quantity} @ Rs${pos.ltp} (P&L: Rs${pos.pnl})`);
    });
    
    // Exit the position
    console.log('\n🚪 Exiting position...');
    const exitOrder = await broker.exitPosition('TCS-EQ', ProductType.INTRADAY);
    console.log(`✅ Position Exited: ${exitOrder.orderId}`);
    
    await broker.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

placeFirstTrade();
```

**Run it:**
```bash
npx ts-node test-trade.ts
```

## 📊 Step 5: Verify Everything Works (2 minutes)

Check these key functions:

```typescript
// 1. Get account info
const balance = await broker.getBalance();
console.log(`Balance: Rs${balance}`);

// 2. Get all orders
const orders = await broker.getOrders();
console.log(`Total Orders: ${orders.length}`);

// 3. Get all positions
const positions = await broker.getPositions();
console.log(`Open Positions: ${positions.length}`);

// 4. Get LTP (Last Traded Price)
const ltp = await broker.getLTP('TCS-EQ', 'NSE');
console.log(`TCS LTP: Rs${ltp}`);

// 5. Test Kill Switch (exit all)
const exitOrders = await broker.exitAllPositions();
console.log(`Exited ${exitOrders.length} positions`);
```

## 🎯 Trading Workflow

### Complete Trading Flow

```
1. CONNECT
   └─ await broker.authenticate()
   
2. CHECK BALANCE
   └─ await broker.getBalance()
   
3. GET POSITIONS
   └─ await broker.getPositions()
   
4. GET QUOTE
   └─ await broker.getLTP('SYMBOL-EQ', 'NSE')
   
5. PLACE ORDER
   └─ await broker.placeOrder({...})
   
6. MONITOR POSITION
   └─ await broker.getPositions() (in loop/polling)
   
7. EXIT POSITION
   └─ await broker.exitPosition('SYMBOL-EQ')
   
   OR
   
   KILL SWITCH
   └─ await broker.exitAllPositions()
   
8. DISCONNECT
   └─ await broker.disconnect()
```

## 🔍 Trading Tips

### Symbol Format

| Market | Format | Example |
|--------|--------|---------|
| NSE Equity | `SYMBOL-EQ` | `TCS-EQ`, `INFY-EQ`, `RELIANCE-EQ` |
| BSE Equity | `SYMBOL-EQ` | `SBIN-EQ` |
| NSE Futures | `SYMBOL-FUT` | `NIFTY-FUT` |
| NSE Options | `SYMBOL-XX` | `BANKNIFTY-11-FEB-24-CE-45000` |
| Indices | `INDEX-IDX` | `NIFTY-50-IDX` |

### Order Types

| Type | Use Case | Price |
|------|----------|-------|
| MARKET | Quick execution | price=0 |
| LIMIT | Control price | price=exact_price |

### Product Types

| Type | Duration | Use Case |
|------|----------|----------|
| INTRADAY (MIS) | Until market close | Day trading |
| DELIVERY (CNC) | Overnight | Long-term holding |
| MARGIN (NRML) | Overnight | Leverage trading |

### Best Practices

1. **Start Small**: Test with 1 share first
2. **Check Margin**: Always verify available margin before orders
3. **Market Hours**: Trade only during 9:15 AM - 3:30 PM IST
4. **Set Stops**: Use stop-loss orders
5. **Monitor P&L**: Check positions regularly
6. **Keep TOTP Fresh**: Generate code within 30 seconds
7. **Use Kill Switch**: Have emergency exit ready

## 🐛 Troubleshooting

### Problem: "TOTP Validation Failed"
**Solution:**
- Generate fresh TOTP code (codes expire every 30 seconds)
- Verify code is correct
- Check authenticator app is synced
- Ensure mobile number format is correct (+919876543210)

### Problem: "MPIN Validation Failed"
**Solution:**
- Verify MPIN is exactly 6 digits
- Check account is active for trading
- Ensure correct mobile number

### Problem: "Insufficient Margin"
**Solution:**
- Check account balance: `broker.getBalance()`
- Reduce order quantity
- Use lower-priced stock
- Add funds to account

### Problem: "Symbol Not Found"
**Solution:**
- Use correct format: `TCS-EQ` (not just `TCS`)
- Check stock trades on selected exchange
- Verify symbol is not delisted

### Problem: "Connection Timeout"
**Solution:**
- Check internet connection
- Verify API endpoint is accessible
- Try again (might be temporary API issue)
- Check Kotak Neo server status

## 📋 Verification Checklist

Before trading live:

- [ ] Consumer Key obtained from Kotak Neo
- [ ] Mobile number verified
- [ ] UCC code confirmed
- [ ] TOTP setup in authenticator app
- [ ] Trading MPIN set
- [ ] .env file updated with all credentials
- [ ] Authentication test passed
- [ ] Balance check successful
- [ ] Positions loaded correctly
- [ ] Test order placed successfully
- [ ] Position exited successfully
- [ ] Kill switch tested
- [ ] Margin checks implemented
- [ ] Error handling verified
- [ ] Documentation reviewed

## 🎓 Next Steps

1. ✅ Complete setup above
2. 📚 Read `KOTAK_NEO_QUICKSTART.md` for more examples
3. 🧪 Test different order types
4. 📊 Monitor trades on Kotak Neo terminal
5. 🤖 Implement your trading strategy
6. 📈 Track performance metrics

## 📞 Need Help?

### Kotak Neo Support
- Website: https://www.kotakneo.com/
- Email: api-support@kotaksecurities.com
- Phone: +91-22-4194-5000

### Your Trading Bot Docs
- Quick Start: `KOTAK_NEO_QUICKSTART.md`
- Full API: `KOTAK_NEO_INTEGRATION.md`
- Examples: `KOTAK_NEO_EXAMPLES.ts`
- Architecture: `KOTAK_NEO_ARCHITECTURE.md`

---

## 🎉 You're All Set!

Your Trading Bot is now configured and ready to trade with Kotak Neo Securities.

**Time to first trade: ~15 minutes** ⏱️

**Happy Trading!** 🚀

---

**Last Updated**: February 26, 2026
**Version**: 1.0
**Status**: Ready for Trading
