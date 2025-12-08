# Twilio SMS Integration Setup Guide

## 📋 Overview

This guide explains how to set up Twilio SMS for notifications with:
- **5-minute delay** for account approvals (cost-saving: skips SMS if notification was read)
- **Immediate SMS** for waitlist promotions (time-sensitive)
- **Immediate SMS** for account rejections (critical)

---

## 💰 Twilio Pricing

**Twilio is one of the cheapest SMS providers:**
- **Free Trial**: $15.50 credit (enough for ~1,000 SMS in US)
- **After Trial**: ~$0.0075–$0.01 per SMS (US)
- **International**: Varies by country (~$0.01–$0.05)

**Estimated Monthly Cost:**
- Low volume (50-100 SMS/month): **$1–$2**
- Medium volume (200-500 SMS/month): **$2–$5**
- High volume (1000+ SMS/month): **$8–$15**

---

## 🚀 Setup Steps

### Step 1: Create Twilio Account

1. Go to [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up for a free account
3. Verify your email and phone number
4. You'll receive **$15.50 free credit** to start

### Step 2: Get Twilio Credentials

1. Log into [Twilio Console](https://console.twilio.com/)
2. Go to **Account** → **API Keys & Tokens**
3. Copy your **Account SID** (starts with `AC...`)
4. Copy your **Auth Token** (click "View" to reveal)

### Step 3: Get a Twilio Phone Number

1. In Twilio Console, go to **Phone Numbers** → **Manage** → **Buy a number**
2. Select a phone number (US numbers are cheapest: ~$1/month)
3. Purchase the number
4. Copy the phone number (format: `+1234567890`)

### Step 4: Set Firebase Environment Variables

Set these environment variables in Firebase Functions:

```bash
# Using Firebase CLI
firebase functions:config:set \
  twilio.account_sid="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  twilio.auth_token="your_auth_token_here" \
  twilio.phone_number="+1234567890"
```

**Or using Firebase Console:**
1. Go to Firebase Console → Your Project → Functions → Configuration
2. Add environment variables:
   - `TWILIO_ACCOUNT_SID` = Your Account SID
   - `TWILIO_AUTH_TOKEN` = Your Auth Token
   - `TWILIO_PHONE_NUMBER` = Your Twilio phone number (with + prefix)

### Step 5: Install Dependencies

The Twilio SDK is already added to `package.json`. Run:

```bash
cd functions
npm install
```

### Step 6: Deploy Functions

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions
firebase deploy --only functions:checkAndDispatchPendingSms,onAccountApprovalUpdated,sendPromotionNotifications
```

---

## 📱 How It Works

### Account Approvals (5-Minute Delay)

1. **Immediate**: In-app notification created
2. **Immediate**: Push notification sent (if enabled)
3. **5-Minute Delay**: SMS queued in `sms_dispatch_queue`
4. **After 5 Minutes**: Scheduled function checks if `notification.read === true`
   - If **read** → Skip SMS (saves cost) ✅
   - If **NOT read** → Send SMS via Twilio ✅

### Waitlist Promotions (Immediate)

1. **Immediate**: In-app notification created
2. **Immediate**: Push notification sent (if enabled)
3. **Immediate**: SMS sent via Twilio (time-sensitive - user needs to RSVP within 24h)
4. **Immediate**: Popup alert queued for next visit

### Account Rejections (Immediate)

1. **Immediate**: In-app notification created
2. **Immediate**: Push notification sent (if enabled)
3. **Immediate**: SMS sent via Twilio (critical - user needs to know)

### Admin Notifications (Immediate)

1. **Immediate**: In-app notification created
2. **Immediate**: Push notification sent (if enabled)
3. **Immediate**: SMS sent via Twilio (if push fails/disabled)

---

## 🔍 Monitoring

### Check SMS Queue Status

```javascript
// In Firebase Console → Firestore
// Collection: sms_dispatch_queue
// Status values:
// - 'pending': Waiting for dispatch time
// - 'dispatched_sms': SMS sent successfully
// - 'skipped_seen': Skipped (notification was read)
// - 'failed': SMS sending failed
```

### View Twilio Logs

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Monitor** → **Logs** → **Messaging**
3. See all sent SMS with delivery status

### Check Scheduled Function

1. Go to Firebase Console → Functions
2. Find `checkAndDispatchPendingSms`
3. View logs to see:
   - How many SMS were sent
   - How many were skipped (read)
   - Any errors

---

## 🧪 Testing

### Test Account Approval SMS

1. Approve a test user account
2. Wait 5 minutes
3. Check `sms_dispatch_queue` collection:
   - If notification was read → status should be `skipped_seen`
   - If notification was NOT read → status should be `dispatched_sms`

### Test Waitlist Promotion SMS

1. Cancel an attendee from an event
2. Check if waitlisted user receives immediate SMS
3. Verify SMS in Twilio Console → Logs

### Test Admin Notification SMS

1. Create a new account approval request
2. Check if admin receives SMS (if push fails/disabled)
3. Verify SMS in Twilio Console → Logs

---

## ⚠️ Troubleshooting

### SMS Not Sending

1. **Check Environment Variables**:
   ```bash
   firebase functions:config:get
   ```
   Verify `twilio.account_sid`, `twilio.auth_token`, `twilio.phone_number` are set

2. **Check Twilio Balance**:
   - Go to Twilio Console → Billing
   - Ensure you have credits available

3. **Check Phone Number Format**:
   - Must include country code: `+1234567890`
   - No spaces or dashes

4. **Check Function Logs**:
   ```bash
   firebase functions:log --only checkAndDispatchPendingSms
   ```

### Scheduled Function Not Running

1. **Check Function Deployment**:
   ```bash
   firebase functions:list
   ```
   Verify `checkAndDispatchPendingSms` is deployed

2. **Check Scheduler**:
   - Go to Firebase Console → Functions
   - Find `checkAndDispatchPendingSms`
   - Verify schedule is set to "every 5 minutes"

3. **Check Permissions**:
   - Ensure Cloud Scheduler API is enabled in Google Cloud Console

---

## 📊 Cost Optimization Tips

1. **5-Minute Delay**: Most users will read notifications within 5 minutes, saving SMS costs
2. **Skip if Read**: The system automatically skips SMS if notification was read
3. **User Preferences**: Users can disable SMS in Profile → Notifications
4. **Monitor Usage**: Check Twilio Console regularly to track costs

---

## 🔐 Security Notes

- **Never commit** Twilio credentials to Git
- Use Firebase environment variables (encrypted at rest)
- Rotate Auth Token periodically
- Monitor Twilio usage for suspicious activity

---

## ✅ Next Steps

1. ✅ Set up Twilio account
2. ✅ Configure environment variables
3. ✅ Deploy functions
4. ✅ Test SMS delivery
5. ✅ Monitor costs in Twilio Console

---

## 📞 Support

- **Twilio Docs**: [https://www.twilio.com/docs](https://www.twilio.com/docs)
- **Twilio Support**: [https://support.twilio.com](https://support.twilio.com)
- **Firebase Functions**: [https://firebase.google.com/docs/functions](https://firebase.google.com/docs/functions)
