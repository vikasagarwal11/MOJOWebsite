# SMS Implementation Summary

## ✅ What Was Implemented

### 1. **Twilio SMS Integration**
- ✅ Added Twilio SDK to `functions/package.json`
- ✅ Created `sendSMSViaTwilio()` helper function
- ✅ Replaced broken Firebase Auth SMS with working Twilio implementation
- ✅ Updated `sendNotificationSMS` Cloud Function to use Twilio

### 2. **5-Minute Delay Queue for Account Approvals**
- ✅ Created `sms_dispatch_queue` collection structure
- ✅ Updated `onAccountApprovalUpdated` to queue SMS with 5-minute delay
- ✅ SMS only sent if `notification.read === false` after 5 minutes
- ✅ Cost-saving: Skips SMS if user already saw the notification

### 3. **Immediate SMS for Waitlist Promotions**
- ✅ Updated `sendPromotionNotifications` to send SMS immediately
- ✅ Time-sensitive: User needs to RSVP within 24 hours
- ✅ Includes in-app, push, SMS, and popup alerts

### 4. **Immediate SMS for Account Rejections**
- ✅ Updated rejection handler to send SMS immediately
- ✅ Critical: User needs to know rejection reason

### 5. **Scheduled Function for Delay Queue**
- ✅ Created `checkAndDispatchPendingSms` scheduled function
- ✅ Runs every 5 minutes
- ✅ Checks if notification was read before sending SMS
- ✅ Updates queue status: `dispatched_sms`, `skipped_seen`, or `failed`

### 6. **Admin Notifications**
- ✅ Updated `sendAdminNotificationWithFallback` to use Twilio
- ✅ Sends SMS immediately if push fails/disabled

---

## 📁 Files Modified

1. **`functions/package.json`**
   - Added `twilio: ^5.3.5` dependency

2. **`functions/src/index.ts`**
   - Added Twilio SMS helper function
   - Updated `sendNotificationSMS` Cloud Function
   - Updated `onAccountApprovalUpdated` (5-minute delay queue)
   - Updated `sendPromotionNotifications` (immediate SMS)
   - Updated `sendAdminNotificationWithFallback` (immediate SMS)
   - Added `checkAndDispatchPendingSms` scheduled function

---

## 🔄 Notification Flow

### Account Approvals (Non-Time-Sensitive)
```
1. User account approved
   ↓
2. In-app notification created ✅
   ↓
3. Push notification sent ✅
   ↓
4. SMS queued with 5-minute delay ⏱️
   ↓
5. After 5 minutes: Check notification.read
   ├─ If read → Skip SMS (save cost) ✅
   └─ If NOT read → Send SMS via Twilio ✅
```

### Waitlist Promotions (Time-Sensitive)
```
1. User promoted from waitlist
   ↓
2. In-app notification created ✅
   ↓
3. Push notification sent ✅
   ↓
4. SMS sent immediately via Twilio ✅
   ↓
5. Popup alert queued for next visit ✅
```

### Account Rejections (Critical)
```
1. User account rejected
   ↓
2. In-app notification created ✅
   ↓
3. Push notification sent ✅
   ↓
4. SMS sent immediately via Twilio ✅
```

---

## 🗄️ Firestore Collections

### `sms_dispatch_queue`
Structure:
```typescript
{
  userId: string;
  phoneNumber: string;
  message: string;
  notificationId: string | null;
  type: 'account_approved' | 'account_rejected' | 'waitlist_promotion';
  status: 'pending' | 'dispatched_sms' | 'skipped_seen' | 'failed';
  createdAt: Timestamp;
  dispatchAt: Timestamp; // 5 minutes from createdAt
  dispatchedAt?: Timestamp;
  skippedAt?: Timestamp;
  failedAt?: Timestamp;
  twilioSid?: string;
  error?: string;
  reason?: string;
}
```

---

## 🔧 Environment Variables Required

Set these in Firebase Functions:
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

See `TWILIO_SMS_SETUP_GUIDE.md` for setup instructions.

---

## 📊 Cost Savings

**Before (Immediate SMS for all):**
- 100 account approvals/month = 100 SMS = ~$1/month

**After (5-Minute Delay with Read Check):**
- 100 account approvals/month
- ~70% read notifications within 5 minutes
- Only 30 SMS sent = ~$0.30/month
- **Savings: ~70%** 💰

---

## 🚀 Deployment Steps

1. **Install Dependencies**:
   ```bash
   cd functions
   npm install
   ```

2. **Set Environment Variables**:
   ```bash
   firebase functions:config:set \
     twilio.account_sid="AC..." \
     twilio.auth_token="..." \
     twilio.phone_number="+1234567890"
   ```

3. **Deploy Functions**:
   ```bash
   firebase deploy --only functions
   ```

4. **Verify Scheduled Function**:
   - Check Firebase Console → Functions
   - Verify `checkAndDispatchPendingSms` is deployed
   - Schedule should be "every 5 minutes"

---

## ✅ Testing Checklist

- [ ] Account approval: SMS queued with 5-minute delay
- [ ] Account approval: SMS skipped if notification read within 5 minutes
- [ ] Account approval: SMS sent if notification NOT read after 5 minutes
- [ ] Waitlist promotion: SMS sent immediately
- [ ] Account rejection: SMS sent immediately
- [ ] Admin notification: SMS sent if push fails/disabled
- [ ] Scheduled function runs every 5 minutes
- [ ] Twilio logs show successful SMS delivery

---

## 📝 Notes

- **Firebase SMS**: Firebase does NOT have a native SMS service for custom notifications (only for phone authentication)
- **Twilio**: One of the cheapest and most reliable SMS providers
- **Cost**: ~$0.0075–$0.01 per SMS (US)
- **Free Trial**: $15.50 credit (enough for ~1,000 SMS)

---

## 🔗 Related Files

- `TWILIO_SMS_SETUP_GUIDE.md` - Complete setup instructions
- `functions/src/index.ts` - Implementation code
- `functions/package.json` - Dependencies
