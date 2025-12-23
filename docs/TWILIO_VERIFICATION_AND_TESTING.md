# Twilio Verification and Testing Guide

## ✅ Plan Upgrade Verification

### 1. **Check Twilio Account Status**

1. Go to [Twilio Console](https://console.twilio.com/)
2. Check the top banner - should show your account balance (not "Trial: $15.50")
3. Go to **Account** → **General Settings**
4. Verify account status shows as **"Active"** (not "Trial")

### 2. **Verify Phone Number Status**

1. Go to **Phone Numbers** → **Manage** → **Active numbers**
2. Find your number: `+18444918631`
3. Click on it to see details
4. Check if it shows any verification requirements

---

## 📞 Toll-Free Verification (If Required)

**Note:** Toll-free verification is typically only needed for toll-free numbers (800, 888, 877, etc.). Your number `+18444918631` appears to be a regular US number, so verification may not be required.

### If Verification is Required:

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Phone Numbers** → **Manage** → **Active numbers**
3. Click on your number `+18444918631`
4. Look for **"Toll-free verification"** or **"Regulatory compliance"** section
5. Follow the prompts to:
   - Provide business information
   - Upload required documents (if needed)
   - Complete verification form
6. Wait for approval (usually 1-3 business days)

### Check Verification Status:

1. Go to **Phone Numbers** → **Manage** → **Active numbers**
2. Your number should show **"Verified"** or **"Active"** status
3. No warnings about verification should appear

---

## 🔧 Environment Variables Setup

### Important: Use `.env.production` (Not `functions.config()`)

Since `functions.config()` is deprecated (will stop working in March 2026), we need to add Twilio credentials to `.env.production`. The deployment script automatically copies this to `functions/.env` for Firebase Functions v2.

### Step 1: Add to `.env.production`

Add these lines to your `.env.production` file:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=[REDACTED]
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

### Step 2: How It Works

1. **Deploy Script** (`deploy-prod.ps1`) automatically:
   - Reads `.env.production`
   - Copies it to `functions/.env` (line 226)
   - Firebase Functions v2 automatically loads `.env` files

2. **Code Access**:
   - The code in `functions/src/index.ts` reads from `process.env.TWILIO_*`
   - It tries `functions.config()` first (for backward compatibility)
   - Falls back to `process.env.*` (which reads from `.env` file)

### Step 3: Deploy

After adding to `.env.production`, run:
```powershell
.\deploy-prod.ps1 functions
```

The script will automatically copy `.env.production` to `functions/.env`.

---

## 📱 Where Phone Number is Used

The phone number `+18444918631` is used in:

1. **`functions/src/index.ts`** (line 405):
   ```typescript
   twilioPhoneNumber = twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;
   ```

2. **Twilio API Call** (line 396-400):
   ```typescript
   const result = await client.messages.create({
     body: message,
     from: twilioPhoneNumber,  // <-- Uses +18444918631
     to: phoneNumber,           // <-- Recipient's phone
   });
   ```

**What it does:**
- `from`: Your Twilio number (`+18444918631`) - the sender
- `to`: Recipient's phone number (from user's profile)

---

## 🧪 Testing SMS Delivery

### Test 1: Verify Environment Variables

After deploying, check function logs:
```bash
firebase functions:log --only sendNotificationSMS
```

Look for:
- ✅ "SMS sent via Twilio. SID: ..." (success)
- ❌ "Twilio credentials not configured" (error - check .env.production)

### Test 2: Test Account Approval SMS (5-Minute Delay)

1. **Approve a test user account**
2. **Check Firestore**:
   - Go to Firebase Console → Firestore
   - Collection: `sms_dispatch_queue`
   - Find document with `status: "pending"`
   - Verify `phoneNumber` and `message` are correct
   - Note the `dispatchAt` time (should be ~5 minutes from now)

3. **Wait 5 minutes**

4. **Check again**:
   - If notification was **read** → status should be `skipped_seen`
   - If notification was **NOT read** → status should be `dispatched_sms`

5. **Check Twilio Console**:
   - Go to [Twilio Console](https://console.twilio.com/)
   - Navigate to **Monitor** → **Logs** → **Messaging**
   - Look for SMS sent to the test user's phone number

### Test 3: Test Waitlist Promotion SMS (Immediate)

1. **Cancel an attendee** from an event (creates a spot)
2. **Check Twilio Console immediately**:
   - Go to **Monitor** → **Logs** → **Messaging**
   - Should see SMS sent within seconds
   - Status should be "delivered" or "sent"

3. **Check recipient's phone**:
   - Should receive SMS immediately
   - Message: "🎉 MOMS FITNESS MOJO: You've been promoted from waitlist! Confirm attendance at..."

### Test 4: Test Account Rejection SMS (Immediate)

1. **Reject a test user account**
2. **Check Twilio Console**:
   - Should see SMS sent immediately
   - Message should include rejection reason

3. **Check recipient's phone**:
   - Should receive SMS immediately

### Test 5: Test Admin Notification SMS

1. **Create a new account approval request**
2. **Disable push notifications** for an admin (in their profile)
3. **Check Twilio Console**:
   - Admin should receive SMS immediately (since push is disabled)

---

## 🔍 Verification Checklist

- [ ] Twilio account upgraded (not trial)
- [ ] Phone number active and verified (if required)
- [ ] Twilio credentials added to `.env.production`
- [ ] Functions deployed with `.\deploy-prod.ps1 functions`
- [ ] Test SMS sent successfully
- [ ] SMS received on test phone number
- [ ] Twilio Console shows SMS logs

---

## ⚠️ Troubleshooting

### SMS Not Sending

1. **Check `.env.production`**:
   ```bash
   # Verify these lines exist:
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=[REDACTED]
   TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
   ```

2. **Check `functions/.env`** (after deployment):
   ```bash
   # Should be copied from .env.production
   cat functions/.env
   ```

3. **Check Function Logs**:
   ```bash
   firebase functions:log
   ```
   Look for Twilio errors

4. **Check Twilio Balance**:
   - Go to Twilio Console → Billing
   - Ensure you have credits

5. **Check Phone Number Format**:
   - Must include `+` and country code: `+18444918631`
   - No spaces or dashes

### "Twilio credentials not configured" Error

This means the environment variables aren't being read. Check:

1. ✅ `.env.production` has the three TWILIO_* variables
2. ✅ Deployed with `.\deploy-prod.ps1 functions` (copies .env.production to functions/.env)
3. ✅ Functions are using v2 (they are - we're using `firebase-functions/v2`)

### SMS Sent But Not Received

1. **Check Twilio Logs**:
   - Go to Twilio Console → Monitor → Logs → Messaging
   - Check delivery status (may show "failed" or "undelivered")

2. **Check Phone Number**:
   - Verify recipient's phone number is correct in Firestore
   - Format: `+1234567890` (with country code)

3. **Check Carrier Blocking**:
   - Some carriers block SMS from unknown numbers
   - User may need to add your number to contacts

---

## 📊 Expected Results

### Account Approval (5-Minute Delay)
- ✅ SMS queued in `sms_dispatch_queue` with `status: "pending"`
- ✅ After 5 min: Either `dispatched_sms` or `skipped_seen`
- ✅ Twilio Console shows SMS (if dispatched)

### Waitlist Promotion (Immediate)
- ✅ SMS sent immediately via Twilio
- ✅ Twilio Console shows SMS within seconds
- ✅ Recipient receives SMS immediately

### Account Rejection (Immediate)
- ✅ SMS sent immediately via Twilio
- ✅ Twilio Console shows SMS within seconds
- ✅ Recipient receives SMS immediately

---

## ✅ Next Steps After Verification

1. ✅ **Add Twilio credentials to `.env.production`**
2. ✅ **Deploy functions**: `.\deploy-prod.ps1 functions`
3. ✅ **Test SMS delivery** with test scenarios above
4. ✅ **Monitor Twilio Console** for delivery status
5. ✅ **Monitor costs** in Twilio Console → Billing

---

## 🔗 Useful Links

- **Twilio Console**: https://console.twilio.com/
- **Twilio Logs**: https://console.twilio.com/us1/monitor/logs/messaging
- **Twilio Billing**: https://console.twilio.com/us1/billing
- **Firebase Functions**: https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions
- **Firestore**: https://console.firebase.google.com/project/momsfitnessmojo-65d00/firestore
