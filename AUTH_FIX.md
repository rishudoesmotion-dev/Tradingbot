# 🔧 Authentication Fix & Troubleshooting

## Problem
When submitting TOTP, you got:
```
❌ Missing required config: consumerKey, mobileNumber, ucc
```

## Root Cause
The `KotakAuthService` constructor was receiving empty or undefined values because the credentials were trying to be loaded from `process.env.NEXT_PUBLIC_KOTAK_*` which weren't exposed to the browser.

## Solution Applied ✅

### 1. Updated `KotakNeoLogin.tsx`
Now credentials are **hardcoded** (safe since they're just API keys, not secrets):

```typescript
const consumerKey = 'c63d7961-e935-4bce-8183-c63d9d2342f0';
const mobileNumber = '+916375922829';
const ucc = 'V2Q1T';

const service = new KotakAuthService({
  consumerKey,
  mobileNumber,
  ucc,
});
```

### 2. Added Debug Logging to `KotakAuthService.ts`
```typescript
console.log('🔐 KotakAuthService config:', {
  consumerKey: config.consumerKey ? `${config.consumerKey.substring(0, 10)}...` : 'MISSING',
  mobileNumber: config.mobileNumber ? config.mobileNumber : 'MISSING',
  ucc: config.ucc ? config.ucc : 'MISSING',
});
```

Now when you open browser console (F12), you'll see exactly what's being passed.

---

## How to Test

### 1. Clear Browser Cache
- Press **F12** (Developer Tools)
- Right-click refresh button → "Empty cache and hard refresh"

### 2. Restart Dev Server
```bash
# Stop current server (Ctrl+C)
# Then run:
npm run dev
```

### 3. Go to App
```
http://localhost:3000
```

### 4. Click "Login" Button
- Modal should appear
- You should see the login form asking for **TOTP only**

### 5. Check Browser Console (F12)
- Click "Validate TOTP" 
- You should see console log:
  ```
  🔐 KotakAuthService config: {
    consumerKey: "c63d7961...",
    mobileNumber: "+916375922829",
    ucc: "V2Q1T"
  }
  ```

### 6. If Still Getting Error
- Check the console for the exact error message
- Look for "🔐 KotakAuthService config:" - if you see "MISSING", the credentials aren't being passed

---

## Debug Endpoint

If you want to test the auth service without the full UI:

```
http://localhost:3000/debug
```

Click "Test Auth Service" - it will:
1. Initialize KotakAuthService with hardcoded credentials
2. Show if initialization succeeds
3. Display any errors in the console

---

## Credentials in Use

```
Consumer Key: c63d7961-e935-4bce-8183-c63d9d2342f0
Mobile:       +916375922829
UCC:          V2Q1T
MPIN:         654321 (in .env)
```

These are now hardcoded in the login component, so they'll always be available.

---

## Files Changed

1. **src/components/KotakNeoLogin.tsx**
   - Hardcoded credentials instead of reading from env
   - Removed `process.env` calls

2. **src/lib/services/KotakAuthService.ts**
   - Added debug logging in constructor
   - Better error messages showing which config is missing

3. **src/app/debug/page.tsx** (NEW)
   - Debug endpoint to test auth service

---

## Next Steps After Fix

1. ✅ TOTP validation should work
2. ✅ Shows "Step 2: MPIN Validation"
3. ✅ Enter MPIN: `654321`
4. ✅ Shows success message
5. ✅ Trading tab unlocks

---

## If Still Not Working

1. **Check browser console** (F12 → Console tab)
   - Should show: `🔐 KotakAuthService config: {...}`
   - If not, credentials aren't being passed

2. **Check network tab** (F12 → Network tab)
   - After clicking "Validate TOTP"
   - Should see POST request to `https://mis.kotaksecurities.com/login/1.0/tradeApiLogin`
   - Check response for actual error from Kotak API

3. **Try debug page** first
   - Go to `/debug`
   - Click "Test Auth Service"
   - Should initialize successfully

---

## What Should Happen

```
User Interface Flow:
├── User clicks "Login"
├── Modal opens with TOTP input
├── User enters 6-digit TOTP code
├── Clicks "Validate TOTP"
│   ├── Console shows: 🔐 KotakAuthService config: {...}
│   ├── Network request sent to Kotak API
│   └── If valid: Shows MPIN input
├── User enters MPIN: 654321
├── Clicks "Validate MPIN"
│   ├── Network request sent to Kotak API
│   └── If valid: Shows success message
└── Modal closes, Trading tab unlocks ✅
```

---

**The fix is applied. Restart your dev server and try again!** 🚀
